/**
 * End-to-end demo walkthrough.
 *
 * Ingests samples/inputs/01-clean-complaint.pdf, generates a five-section
 * draft, applies one operator edit per section, re-generates, and prints
 * a before/after comparison with grounding and edit-distance metrics.
 *
 * Usage: npm run demo
 *        API_URL=http://localhost:3000 tsx scripts/e2e-walkthrough.ts
 *
 * @author Al Amin Ahamed
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { diffWords } from "diff";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_URL = process.env["API_URL"] ?? "http://localhost:3000";
const PDF_PATH = path.join(__dirname, "../samples/inputs/01-clean-complaint.pdf");

const SECTIONS = ["parties", "key_dates", "issues", "procedural_history", "relief"] as const;
type Section = (typeof SECTIONS)[number];

const SECTION_LABELS: Record<Section, string> = {
  parties: "Parties",
  key_dates: "Key Dates",
  issues: "Issues / Allegations",
  procedural_history: "Procedural History",
  relief: "Relief Sought",
};

const MONTHS: Record<string, string> = {
  January: "01", February: "02", March: "03", April: "04",
  May: "05", June: "06", July: "07", August: "08",
  September: "09", October: "10", November: "11", December: "12",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function hr(char = "─", width = 70): string {
  return char.repeat(width);
}

function wordEditDistance(a: string, b: string): number {
  return diffWords(a, b).reduce((acc, c) => acc + (c.added || c.removed ? (c.count ?? 1) : 0), 0);
}

function applyOperatorEdit(section: Section, text: string): string {
  switch (section) {
    case "parties":
      return text.replace(/\bP\.\s*Specter\b/g, "Mr. P. Specter, Esq.");
    case "key_dates":
      return text.replace(
        /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\b/g,
        (_m, month: string, day: string, year: string) =>
          `${year}-${MONTHS[month] ?? "01"}-${day.padStart(2, "0")}`,
      );
    case "issues":
      return text.replace(/^(\d+)\.\s+/gm, (_m, n: string) => `Count ${n}: `);
    case "procedural_history":
      return text
        .replace(/\bdenies\b/g, "denied")
        .replace(/\bfiles\b/g, "filed")
        .replace(/\brequests\b/g, "requested")
        .replace(/\bmoves\b/g, "moved");
    case "relief":
      return text.replace(/\bPlaintiff seeks\b/g, "Plaintiff respectfully requests");
  }
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${path} → HTTP ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

async function ingestFile(filePath: string): Promise<{ documentId: string; chunkCount: number; ocrConfidence: number; fields: unknown }> {
  const bytes = fs.readFileSync(filePath);
  const filename = path.basename(filePath);
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "application/pdf" }), filename);

  const res = await fetch(`${API_URL}/ingest`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`/ingest → HTTP ${res.status}: ${await res.text()}`);
  return res.json() as Promise<{ documentId: string; chunkCount: number; ocrConfidence: number; fields: unknown }>;
}

function printDraft(label: string, sections: Record<string, { content: string; groundingScore: number; citations: unknown[] }>): void {
  process.stdout.write(`\n${hr("═")}\n${label}\n${hr("═")}\n`);
  for (const section of SECTIONS) {
    const s = sections[section];
    if (!s) continue;
    const sLabel = SECTION_LABELS[section];
    process.stdout.write(`\n${hr("─")}\n§ ${sLabel}  (grounding: ${(s.groundingScore * 100).toFixed(0)}%  citations: ${s.citations.length})\n${hr("─")}\n`);
    process.stdout.write(s.content + "\n");
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  process.stdout.write(`\n${"═".repeat(70)}\nLegal RAG — End-to-End Demo Walkthrough\n${"═".repeat(70)}\n\n`);
  process.stdout.write(`API:  ${API_URL}\nFile: ${PDF_PATH}\n`);

  if (!fs.existsSync(PDF_PATH)) {
    process.stderr.write(`\nERROR: ${PDF_PATH} not found.\nRun: tsx scripts/generate-samples.ts\n`);
    process.exit(1);
  }

  // ── Step 1: Ingest ────────────────────────────────────────────────────────
  process.stdout.write("\n[1/6] Ingesting document...\n");
  const ingestResult = await ingestFile(PDF_PATH);
  process.stdout.write(`      Document ID:  ${ingestResult.documentId}\n`);
  process.stdout.write(`      Chunks:       ${ingestResult.chunkCount}\n`);
  process.stdout.write(`      OCR conf:     ${(ingestResult.ocrConfidence * 100).toFixed(0)}%\n`);
  process.stdout.write(`      Fields:       ${JSON.stringify(ingestResult.fields, null, 0).slice(0, 120)}...\n`);

  // ── Step 2: Generate initial draft ────────────────────────────────────────
  process.stdout.write("\n[2/6] Generating initial draft (5 sections)...\n");
  const draftResult1 = await apiPost<{
    documentId: string;
    sections: Record<string, { draftId: string; content: string; groundingScore: number; citations: unknown[] }>;
    providerUsed: string;
  }>("/draft", { document_id: ingestResult.documentId });

  process.stdout.write(`      Provider: ${draftResult1.providerUsed}\n`);

  const avgGrounding1 = SECTIONS.reduce((s, k) => s + (draftResult1.sections[k]?.groundingScore ?? 0), 0) / SECTIONS.length;
  process.stdout.write(`      Mean grounding score: ${(avgGrounding1 * 100).toFixed(1)}%\n`);

  // ── Step 3: Print initial draft ───────────────────────────────────────────
  process.stdout.write("\n[3/6] Initial draft:\n");
  printDraft("DRAFT 1 — Initial Generation", draftResult1.sections);

  // ── Step 4: Apply operator edits ─────────────────────────────────────────
  process.stdout.write(`\n\n[4/6] Applying operator edits to each section...\n`);
  const editResults: Record<string, { signalScore: number; class: string; promotedToExemplar: boolean }> = {};

  for (const section of SECTIONS) {
    const s = draftResult1.sections[section];
    if (!s) continue;
    const edited = applyOperatorEdit(section, s.content);
    const dist = wordEditDistance(s.content, edited);

    if (dist === 0) {
      process.stdout.write(`      ${section.padEnd(22)}: no change\n`);
      continue;
    }

    const editRes = await apiPost<{
      editId: string;
      classification: { class: string; confidence: number };
      signalScore: number;
      promotedToExemplar: boolean;
    }>("/edit", { draft_id: s.draftId, section, edited_text: edited });

    editResults[section] = {
      signalScore: editRes.signalScore,
      class: editRes.classification.class,
      promotedToExemplar: editRes.promotedToExemplar,
    };

    process.stdout.write(
      `      ${section.padEnd(22)}: dist=${dist}  class=${editRes.classification.class.padEnd(20)} score=${editRes.signalScore.toFixed(2)}  exemplar=${editRes.promotedToExemplar}\n`,
    );
  }

  // ── Step 5: Re-generate with learned signals ──────────────────────────────
  process.stdout.write("\n[5/6] Re-generating with learned signals...\n");
  const draftResult2 = await apiPost<{
    documentId: string;
    sections: Record<string, { draftId: string; content: string; groundingScore: number; citations: unknown[] }>;
    providerUsed: string;
  }>("/draft", { document_id: ingestResult.documentId });

  const avgGrounding2 = SECTIONS.reduce((s, k) => s + (draftResult2.sections[k]?.groundingScore ?? 0), 0) / SECTIONS.length;
  process.stdout.write(`      Provider: ${draftResult2.providerUsed}\n`);
  process.stdout.write(`      Mean grounding score: ${(avgGrounding2 * 100).toFixed(1)}%\n`);

  printDraft("DRAFT 2 — After Edit-Loop Signals", draftResult2.sections);

  // ── Step 6: Before/after comparison ──────────────────────────────────────
  process.stdout.write(`\n\n[6/6] Before / after comparison:\n\n`);
  process.stdout.write(`${"Section".padEnd(24)}  ${"Dist-1".padEnd(8)}  ${"Dist-2".padEnd(8)}  ${"Delta".padEnd(8)}  Grounding-1  Grounding-2\n`);
  process.stdout.write(`${hr()}\n`);

  let totalDist1 = 0, totalDist2 = 0;
  for (const section of SECTIONS) {
    const s1 = draftResult1.sections[section];
    const s2 = draftResult2.sections[section];
    if (!s1 || !s2) continue;
    const edited1 = applyOperatorEdit(section, s1.content);
    const edited2 = applyOperatorEdit(section, s2.content);
    const d1 = wordEditDistance(s1.content, edited1);
    const d2 = wordEditDistance(s2.content, edited2);
    const delta = d2 - d1;
    totalDist1 += d1;
    totalDist2 += d2;

    process.stdout.write(
      `${section.padEnd(24)}  ${String(d1).padEnd(8)}  ${String(d2).padEnd(8)}  ${(delta <= 0 ? "" : "+") + delta}${" ".repeat(Math.max(0, 8 - String(delta).length))}  ` +
      `${(s1.groundingScore * 100).toFixed(0) + "%"}         ${(s2.groundingScore * 100).toFixed(0) + "%"}\n`,
    );
  }

  process.stdout.write(`${hr()}\n`);
  const reduction = totalDist1 > 0 ? ((totalDist1 - totalDist2) / totalDist1) * 100 : 0;
  process.stdout.write(`${"TOTAL".padEnd(24)}  ${String(totalDist1).padEnd(8)}  ${String(totalDist2).padEnd(8)}  ${reduction.toFixed(0)}% reduction\n`);
  process.stdout.write(`\nGrounding: ${(avgGrounding1 * 100).toFixed(1)}% → ${(avgGrounding2 * 100).toFixed(1)}%\n`);

  process.stdout.write(`\n${"═".repeat(70)}\nDemo complete.\n${"═".repeat(70)}\n\n`);
}

main().catch(err => {
  process.stderr.write(`\nFatal: ${String(err)}\n\n`);
  process.stderr.write("Check that docker compose is running: docker compose up -d\n");
  process.exit(1);
});
