/**
 * Operator edit simulation for edit-loop evaluation.
 *
 * Usage:
 *   tsx eval/simulate-operator.ts [--round 1|2]
 *
 * Round 1: generate drafts, apply edits, measure distances.
 * Round 2: re-generate (with learned signals injected), apply same edits,
 *          compare distances to Round 1 to confirm improvement.
 *
 * @author Al Amin Ahamed
 */

import "dotenv/config";
import postgres from "postgres";
import { diffWords } from "diff";
import { applyEdit } from "./edit-patterns.js";

const API_URL = process.env["API_URL"] ?? "http://localhost:3000";
const DATABASE_URL = process.env["DATABASE_URL"] ?? "postgres://legal:secret@localhost:5432/legalrag";
const ROUND = process.argv.includes("--round") ? parseInt(process.argv[process.argv.indexOf("--round") + 1] ?? "1", 10) : 1;

const db = postgres(DATABASE_URL, { max: 3 });

// ── Utility ──────────────────────────────────────────────────────────────────

function wordEditDistance(a: string, b: string): number {
  return diffWords(a, b).reduce((acc, c) => acc + (c.added || c.removed ? (c.count ?? 1) : 0), 0);
}

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function generateDraft(documentId: string): Promise<Record<string, { draftId: string; content: string }>> {
  const res = await fetch(`${API_URL}/draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ document_id: documentId }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`POST /draft ${res.status}: ${err}`);
  }
  const data = await res.json() as { sections: Record<string, { draftId: string; content: string }> };
  return data.sections;
}

async function submitEdit(draftId: string, section: string, editedText: string): Promise<void> {
  const res = await fetch(`${API_URL}/edit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ draft_id: draftId, section, edited_text: editedText }),
  });
  if (!res.ok) {
    const err = await res.text();
    process.stderr.write(`POST /edit ${res.status}: ${err}\n`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  process.stdout.write(`\n=== Operator Simulation — Round ${ROUND} ===\n\n`);

  // Find up to 3 documents
  const docs = await db<Array<{ id: string; filename: string }>>`
    SELECT id, filename FROM documents ORDER BY created_at LIMIT 3
  `;

  if (docs.length === 0) {
    process.stderr.write("No documents found. Ingest samples first: tsx scripts/test-ingest.ts\n");
    process.exit(1);
  }

  process.stdout.write(`Found ${docs.length} document(s)\n\n`);

  const SECTIONS = ["parties", "key_dates", "issues", "procedural_history", "relief"] as const;

  // Table header
  process.stdout.write(
    pad("Document", 28) + pad("Section", 22) + pad("EditDist", 10) + pad("Changed?", 10) + "\n",
  );
  process.stdout.write("-".repeat(70) + "\n");

  let totalDist = 0;
  let editedCount = 0;

  for (const doc of docs) {
    process.stdout.write(`\nDocument: ${doc.filename} (${doc.id.slice(0, 8)}...)\n`);

    let sections: Record<string, { draftId: string; content: string }>;
    try {
      sections = await generateDraft(doc.id);
    } catch (err) {
      process.stderr.write(`  Draft generation failed: ${String(err)}\n`);
      continue;
    }

    for (const section of SECTIONS) {
      const sectionData = sections[section];
      if (!sectionData) continue;

      const { draftId, content } = sectionData;
      const edited = applyEdit(section, content);
      const dist = wordEditDistance(content, edited);

      if (dist > 0) {
        await submitEdit(draftId, section, edited);
        editedCount++;
      }

      totalDist += dist;
      process.stdout.write(
        pad("  " + doc.filename.slice(0, 24), 28) +
        pad(section, 22) +
        pad(String(dist), 10) +
        pad(dist > 0 ? "YES" : "no", 10) + "\n",
      );
    }
  }

  process.stdout.write("\n" + "-".repeat(70) + "\n");
  process.stdout.write(`Total word edit distance: ${totalDist}\n`);
  process.stdout.write(`Edits submitted: ${editedCount}\n`);

  if (ROUND === 1) {
    process.stdout.write(
      "\nRound 1 complete. Exemplars and preferences have been stored.\n" +
      "Run with --round 2 after a moment to measure improvement:\n" +
      "  tsx eval/simulate-operator.ts --round 2\n\n",
    );
  } else {
    process.stdout.write(
      "\nRound 2 complete. Compare total edit distances:\n" +
      "  Round 1 distance > Round 2 distance = edit-loop is learning.\n\n",
    );
  }

  await db.end();
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
