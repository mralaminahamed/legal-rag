/**
 * Operator edit simulation for edit-loop evaluation.
 *
 * For each document:
 *   1. Generate draft 1.
 *   2. Apply substitutive operator edits to produce the operator-preferred form.
 *   3. POST the preferred form to /edit (teaches the edit loop).
 *   4. Regenerate draft 2 (with learned signals injected).
 *   5. Compare: how far is draft 2 from the operator-preferred form vs draft 1?
 *      Decreasing distance = the model learned the pattern.
 *
 * Usage:
 *   tsx eval/simulate-operator.ts
 *
 * @author Al Amin Ahamed
 */

import "dotenv/config";
import postgres from "postgres";
import { diffWords } from "diff";
import { applyEdit } from "./edit-patterns.js";

const API_URL = process.env["API_URL"] ?? "http://localhost:3000";
const DATABASE_URL = process.env["DATABASE_URL"] ?? "postgres://legal:secret@localhost:5432/legalrag";

const db = postgres(DATABASE_URL, { max: 3 });

const SECTIONS = ["parties", "key_dates", "issues", "procedural_history", "relief"] as const;
type Section = (typeof SECTIONS)[number];

// ── Helpers ───────────────────────────────────────────────────────────────────

function wordDist(a: string, b: string): number {
  return diffWords(a, b).reduce((acc, c) => acc + (c.added || c.removed ? (c.count ?? 1) : 0), 0);
}

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
}

function pct(delta: number, base: number): string {
  if (base === 0) return "—";
  const p = ((delta / base) * 100).toFixed(0);
  return delta <= 0 ? `${Math.abs(Number(p))}% reduction` : `${p}% increase`;
}

// ── API helpers ───────────────────────────────────────────────────────────────

type SectionData = { draftId: string; content: string };

async function generateDraft(documentId: string): Promise<Record<string, SectionData>> {
  const res = await fetch(`${API_URL}/draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ document_id: documentId }),
  });
  if (!res.ok) throw new Error(`POST /draft ${res.status}: ${await res.text()}`);
  const data = await res.json() as { sections: Record<string, SectionData> };
  return data.sections;
}

async function submitEdit(
  draftId: string,
  section: string,
  editedText: string,
): Promise<{ signalScore: number; class: string; promotedToExemplar: boolean }> {
  const res = await fetch(`${API_URL}/edit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ draft_id: draftId, section, edited_text: editedText }),
  });
  if (!res.ok) {
    process.stderr.write(`  WARN /edit ${res.status}: ${await res.text()}\n`);
    return { signalScore: 0, class: "unknown", promotedToExemplar: false };
  }
  const d = await res.json() as {
    signalScore: number;
    classification: { class: string };
    promotedToExemplar: boolean;
  };
  return { signalScore: d.signalScore, class: d.classification.class, promotedToExemplar: d.promotedToExemplar };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  process.stdout.write(`\n${"═".repeat(72)}\nEdit-Loop Simulation\n${"═".repeat(72)}\n`);

  const docs = await db<Array<{ id: string; filename: string }>>`
    SELECT id, filename FROM documents ORDER BY created_at LIMIT 3
  `;

  if (docs.length === 0) {
    process.stderr.write("No documents. Run: npm run demo\n");
    process.exit(1);
  }

  let totalDist1 = 0;
  let totalDist2 = 0;

  for (const doc of docs) {
    process.stdout.write(`\nDocument: ${doc.filename}\n\n`);
    process.stdout.write(
      `${pad("Section", 22)}  ${pad("Class", 22)}  Score  Promoted  Dist1→Pref  Dist2→Pref  Δ\n`,
    );
    process.stdout.write("─".repeat(100) + "\n");

    // ── Draft 1 ──────────────────────────────────────────────────────────────
    let draft1: Record<string, SectionData>;
    try {
      draft1 = await generateDraft(doc.id);
    } catch (err) {
      process.stderr.write(`  Draft 1 failed for ${doc.id}: ${String(err)}\n`);
      continue;
    }

    // ── Apply edits and submit ────────────────────────────────────────────────
    for (const section of SECTIONS) {
      const s1 = draft1[section];
      if (!s1) continue;

      const preferred = applyEdit(section, s1.content);
      const dist1 = wordDist(s1.content, preferred);

      let editMeta = { signalScore: 0, class: "—", promotedToExemplar: false };
      if (dist1 > 0) {
        editMeta = await submitEdit(s1.draftId, section, preferred);
      }

      // Temporarily store dist1 for comparison after draft 2
      // We'll compute dist2 after regeneration
      (draft1 as Record<string, SectionData & { _dist1?: number; _preferred?: string }>)[section] =
        { ...s1, _dist1: dist1, _preferred: preferred } as SectionData & { _dist1: number; _preferred: string };

      process.stdout.write(
        `${pad(section, 22)}  ${pad(editMeta.class, 22)}  ${editMeta.signalScore.toFixed(2)}  ` +
        `${editMeta.promotedToExemplar ? "✓" : "—"}         ` +
        `${String(dist1).padEnd(12)}` +
        `(pending)\n`,
      );
    }

    // ── Draft 2 — with learned signals ───────────────────────────────────────
    process.stdout.write("\n  Regenerating with learned signals...\n\n");
    process.stdout.write(
      `${pad("Section", 22)}  ${pad("Dist1→Pref", 12)}  ${pad("Dist2→Pref", 12)}  Direction\n`,
    );
    process.stdout.write("─".repeat(72) + "\n");

    let draft2: Record<string, SectionData>;
    try {
      draft2 = await generateDraft(doc.id);
    } catch (err) {
      process.stderr.write(`  Draft 2 failed: ${String(err)}\n`);
      continue;
    }

    for (const section of SECTIONS) {
      const s1ext = draft1[section] as (SectionData & { _dist1?: number; _preferred?: string }) | undefined;
      const s2 = draft2[section];
      if (!s1ext || !s2) continue;

      const preferred1 = s1ext._preferred ?? applyEdit(section, s1ext.content);
      const dist1 = s1ext._dist1 ?? wordDist(s1ext.content, preferred1);

      // Distance from draft 2 to what the operator would prefer about draft 2
      const preferred2 = applyEdit(section, s2.content);
      const dist2 = wordDist(s2.content, preferred2);

      const delta = dist2 - dist1;
      const direction = pct(delta, dist1);

      totalDist1 += dist1;
      totalDist2 += dist2;

      process.stdout.write(
        `${pad(section, 22)}  ${String(dist1).padEnd(14)}${String(dist2).padEnd(14)}${direction}\n`,
      );
    }
  }

  const totalDelta = totalDist2 - totalDist1;
  process.stdout.write("\n" + "═".repeat(72) + "\n");
  process.stdout.write(
    `TOTAL  ${totalDist1} → ${totalDist2}  (${pct(totalDelta, totalDist1)})\n`,
  );

  if (totalDelta < 0) {
    process.stdout.write("✓ Edit loop is converging — model is learning operator preferences.\n");
  } else if (totalDelta === 0) {
    process.stdout.write("― No change. Patterns may not match generated content.\n");
  } else {
    process.stdout.write("✗ Edit distance increased. Check that applyEdit patterns match generated text.\n");
  }

  await db.end();
}

main().catch(err => { process.stderr.write(String(err) + "\n"); process.exit(1); });
