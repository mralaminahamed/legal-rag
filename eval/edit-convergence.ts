/**
 * Edit convergence evaluation — measures how much the edit-loop reduces
 * operator edit distance across N iterations.
 *
 * Usage:
 *   CONFIRM_RESET=1 tsx eval/edit-convergence.ts [--iterations 5]
 *
 * Requires CONFIRM_RESET=1 to prevent accidental data wipe during development.
 *
 * @author Al Amin Ahamed
 */

import "dotenv/config";
import postgres from "postgres";
import { diffWords } from "diff";
import { applyEdit } from "./edit-patterns.js";

const DATABASE_URL = process.env["DATABASE_URL"] ?? "postgres://legal:secret@localhost:5432/legalrag";
const API_URL = process.env["API_URL"] ?? "http://localhost:3000";
const CONFIRM_RESET = process.env["CONFIRM_RESET"] === "1";
const N_ITERATIONS = (() => {
  const idx = process.argv.indexOf("--iterations");
  return idx >= 0 ? parseInt(process.argv[idx + 1] ?? "5", 10) : 5;
})();

const db = postgres(DATABASE_URL, { max: 3 });

const SECTIONS = ["parties", "key_dates", "issues", "procedural_history", "relief"] as const;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface IterationResult {
  iteration: number;
  totalEditDistance: number;
  perSection: Record<string, number>;
}

export interface ConvergenceResult {
  iterations: IterationResult[];
  startDistance: number;
  endDistance: number;
  reductionPct: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function wordEditDistance(a: string, b: string): number {
  return diffWords(a, b).reduce((acc, c) => acc + (c.added || c.removed ? (c.count ?? 1) : 0), 0);
}

async function generateDraft(documentId: string): Promise<Record<string, { draftId: string; content: string }>> {
  const res = await fetch(`${API_URL}/draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ document_id: documentId }),
  });
  if (!res.ok) throw new Error(`POST /draft ${res.status}: ${await res.text()}`);
  const data = await res.json() as { sections: Record<string, { draftId: string; content: string }> };
  return data.sections;
}

async function submitEdit(draftId: string, section: string, editedText: string): Promise<void> {
  const res = await fetch(`${API_URL}/edit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ draft_id: draftId, section, edited_text: editedText }),
  });
  if (!res.ok) process.stderr.write(`  WARN: POST /edit ${res.status}: ${await res.text()}\n`);
}

// ── Core evaluator ─────────────────────────────────────────────────────────────

/**
 * Resets edit_exemplars and style_preferences tables.
 * Requires CONFIRM_RESET=1 env var — hard guard against accidental wipe.
 *
 * @throws {Error} When CONFIRM_RESET is not set
 * @author Al Amin Ahamed
 */
export async function resetEditState(): Promise<void> {
  if (!CONFIRM_RESET) {
    throw new Error("Set CONFIRM_RESET=1 to allow resetting edit_exemplars and style_preferences");
  }
  await db`TRUNCATE edit_exemplars`;
  await db`TRUNCATE style_preferences`;
  process.stdout.write("  Reset: edit_exemplars and style_preferences cleared.\n");
}

/**
 * Runs N iterations of: generate → apply operator edits → submit → measure.
 * Each iteration accumulates edit-loop signals; later iterations should show
 * reduced edit distance as the model learns operator preferences.
 *
 * @param documentIds - Document UUIDs to use (uses all if not provided)
 * @returns Convergence metrics per iteration
 * @author Al Amin Ahamed
 */
export async function runConvergence(documentIds?: string[]): Promise<ConvergenceResult> {
  let docIds = documentIds ?? [];
  if (docIds.length === 0) {
    const docs = await db<Array<{ id: string }>>`SELECT id FROM documents ORDER BY created_at LIMIT 3`;
    docIds = docs.map(d => d.id);
  }

  if (docIds.length === 0) throw new Error("No documents in DB — ingest samples first");

  const iterations: IterationResult[] = [];

  for (let iter = 1; iter <= N_ITERATIONS; iter++) {
    process.stdout.write(`\n  Iteration ${iter}/${N_ITERATIONS}...\n`);

    let totalDist = 0;
    const perSection: Record<string, number> = {};
    for (const s of SECTIONS) perSection[s] = 0;

    for (const docId of docIds) {
      let sections: Record<string, { draftId: string; content: string }>;
      try {
        sections = await generateDraft(docId);
      } catch (err) {
        process.stderr.write(`    Draft generation failed for ${docId}: ${String(err)}\n`);
        continue;
      }

      for (const section of SECTIONS) {
        const s = sections[section];
        if (!s) continue;
        const edited = applyEdit(section, s.content);
        const dist = wordEditDistance(s.content, edited);
        perSection[section] = (perSection[section] ?? 0) + dist;
        totalDist += dist;
        if (dist > 0) await submitEdit(s.draftId, section, edited);
      }
    }

    iterations.push({ iteration: iter, totalEditDistance: totalDist, perSection });
    process.stdout.write(`    Total edit distance: ${totalDist}\n`);

    // Brief pause to let preference updates settle (async debounce)
    await new Promise(r => setTimeout(r, 2_000));
  }

  const startDist = iterations[0]?.totalEditDistance ?? 0;
  const endDist = iterations[iterations.length - 1]?.totalEditDistance ?? 0;
  const reductionPct = startDist > 0 ? ((startDist - endDist) / startDist) * 100 : 0;

  return { iterations, startDistance: startDist, endDistance: endDist, reductionPct };
}

// ── CLI runner ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  process.stdout.write(`\n=== Edit Convergence Evaluation (N=${N_ITERATIONS}) ===\n`);

  if (!CONFIRM_RESET) {
    process.stderr.write("Set CONFIRM_RESET=1 to allow resetting state for a clean evaluation.\n");
    process.exit(1);
  }

  process.stdout.write("\nResetting edit state for clean evaluation...\n");
  await resetEditState();

  const result = await runConvergence();

  process.stdout.write("\n\n=== Results ===\n");
  process.stdout.write(`${"Iteration".padEnd(12)}  Edit Distance\n`);
  process.stdout.write("-".repeat(30) + "\n");
  for (const it of result.iterations) {
    process.stdout.write(`${String(it.iteration).padEnd(12)}  ${it.totalEditDistance}\n`);
  }
  process.stdout.write("-".repeat(30) + "\n");
  process.stdout.write(`Reduction: ${result.startDistance} → ${result.endDistance} (${result.reductionPct.toFixed(1)}%)\n`);

  await db.end();
}

if (process.argv[1]?.endsWith("edit-convergence.ts") || process.argv[1]?.endsWith("edit-convergence.js")) {
  main().catch(err => { process.stderr.write(String(err) + "\n"); process.exit(1); });
}
