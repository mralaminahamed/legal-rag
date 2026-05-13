/**
 * End-to-end demo walkthrough.
 *
 * Usage:
 *   npm run demo                        → default: 01-clean-complaint.pdf
 *   npm run demo -- --all               → all five samples sequentially
 *   npm run demo -- --file <path>       → specific file
 *
 * @author Al Amin Ahamed
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { diffWords } from "diff";
import { applyEdit } from "../eval/edit-patterns.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLES_DIR = path.join(__dirname, "../samples/inputs");

const ARGV = process.argv.slice(2);
const RUN_ALL = ARGV.includes("--all");
const FILE_IDX = ARGV.indexOf("--file");
const CUSTOM_FILE = FILE_IDX >= 0 ? ARGV[FILE_IDX + 1] : undefined;

const DEFAULT_PDF = path.join(SAMPLES_DIR, "01-clean-complaint.pdf");

/** All samples including image-only variants to exercise the OCR fallback chain. */
const ALL_SAMPLES = [
  path.join(SAMPLES_DIR, "01-clean-complaint.pdf"),
  path.join(SAMPLES_DIR, "02-scanned-notice.pdf"),
  path.join(SAMPLES_DIR, "02-scanned-notice-IMG.pdf"),
  path.join(SAMPLES_DIR, "03-low-quality-contract.pdf"),
  path.join(SAMPLES_DIR, "03-low-quality-contract-IMG.pdf"),
];

const FILES_TO_RUN: string[] = RUN_ALL
  ? ALL_SAMPLES.filter(f => fs.existsSync(f))
  : [CUSTOM_FILE ?? DEFAULT_PDF];

const API_URL = process.env["API_URL"] ?? "http://localhost:3000";

/** Number of edit-loop iterations to run per document. Shows convergence trend. */
const EDIT_ITERATIONS = 3;

const SECTIONS = ["parties", "key_dates", "issues", "procedural_history", "relief"] as const;
type Section = (typeof SECTIONS)[number];

const SECTION_LABELS: Record<Section, string> = {
  parties: "Parties",
  key_dates: "Key Dates",
  issues: "Issues / Allegations",
  procedural_history: "Procedural History",
  relief: "Relief Sought",
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface IngestResult {
  documentId: string;
  chunkCount: number;
  ocrConfidence: number;
  ocrStrategy: string;
  fields: {
    document_type: string | null;
    parties: { plaintiffs: string[]; defendants: string[]; counsel: string[] };
    key_dates: Array<{ label: string; iso_date: string }>;
  };
}

interface SectionData {
  draftId: string;
  content: string;
  groundingScore: number;
  citations: unknown[];
}

interface DocSummary {
  filename: string;
  ocrStrategy: string;
  fieldsExtracted: boolean;
  meanGrounding: number;
  convergencePct: number;
  distByIteration: number[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function hr(char = "─", width = 72): string { return char.repeat(width); }

function wordDist(a: string, b: string): number {
  return diffWords(a, b).reduce((acc, c) => acc + (c.added || c.removed ? (c.count ?? 1) : 0), 0);
}

function pct(n: number, base: number): string {
  if (base === 0) return "—";
  return `${((n / base) * 100).toFixed(0)}%`;
}

function fmt(n: number): string { return (n * 100).toFixed(1) + "%"; }

// ── API helpers ───────────────────────────────────────────────────────────────

async function ingestFile(filePath: string): Promise<IngestResult> {
  const bytes = fs.readFileSync(filePath);
  const filename = path.basename(filePath);
  const form = new FormData();
  const mime = filename.endsWith(".pdf") ? "application/pdf" : "image/png";
  form.append("file", new Blob([bytes], { type: mime }), filename);
  const res = await fetch(`${API_URL}/ingest`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`/ingest HTTP ${res.status}: ${await res.text()}`);
  return res.json() as Promise<IngestResult>;
}

async function generateDraft(documentId: string): Promise<Record<string, SectionData>> {
  const res = await fetch(`${API_URL}/draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ document_id: documentId }),
  });
  if (!res.ok) throw new Error(`/draft HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json() as { sections: Record<string, SectionData>; providerUsed: string };
  return data.sections;
}

async function submitEdit(draftId: string, section: string, edited: string): Promise<void> {
  const res = await fetch(`${API_URL}/edit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ draft_id: draftId, section, edited_text: edited }),
  });
  if (!res.ok) process.stderr.write(`  WARN /edit ${res.status}: ${await res.text()}\n`);
}

// ── Per-document run ──────────────────────────────────────────────────────────

async function runDocument(filePath: string, idx: number, total: number): Promise<DocSummary> {
  const filename = path.basename(filePath);

  process.stdout.write(`\n${hr("═")}\n[${idx + 1}/${total}] ${filename}\n${hr("═")}\n`);

  if (!fs.existsSync(filePath)) {
    process.stderr.write(`  ERROR: file not found: ${filePath}\n  Run: tsx scripts/generate-samples.ts\n`);
    process.exit(1);
  }

  // ── 1. Ingest ─────────────────────────────────────────────────────────────
  process.stdout.write("\n[1] Ingesting...\n");
  const ingest = await ingestFile(filePath);
  const fieldsExtracted =
    (ingest.fields.parties.plaintiffs.length > 0 ||
     ingest.fields.parties.defendants.length > 0 ||
     ingest.fields.key_dates.length > 0);

  process.stdout.write(`    document_id:    ${ingest.documentId}\n`);
  process.stdout.write(`    chunks:         ${ingest.chunkCount}\n`);
  process.stdout.write(`    ocr_strategy:   ${ingest.ocrStrategy}\n`);
  process.stdout.write(`    ocr_confidence: ${fmt(ingest.ocrConfidence)}\n`);
  process.stdout.write(`    document_type:  ${ingest.fields.document_type ?? "(null)"}\n`);
  process.stdout.write(`    plaintiffs:     ${ingest.fields.parties.plaintiffs.join(", ") || "(none)"}\n`);
  process.stdout.write(`    defendants:     ${ingest.fields.parties.defendants.join(", ") || "(none)"}\n`);
  process.stdout.write(`    key_dates:      ${ingest.fields.key_dates.length}\n`);

  // ── 2. Initial draft ──────────────────────────────────────────────────────
  process.stdout.write("\n[2] Generating initial draft...\n");
  const draft0 = await generateDraft(ingest.documentId);

  const meanGrounding =
    SECTIONS.reduce((s, k) => s + (draft0[k]?.groundingScore ?? 0), 0) / SECTIONS.length;
  process.stdout.write(`    Mean grounding: ${fmt(meanGrounding)}\n`);

  process.stdout.write(`\n${hr()}\nINITIAL DRAFT\n${hr()}`);
  for (const section of SECTIONS) {
    const s = draft0[section];
    if (!s) continue;
    process.stdout.write(
      `\n\n§ ${SECTION_LABELS[section]}  (grounding: ${fmt(s.groundingScore)}  citations: ${s.citations.length})\n${hr("·")}\n${s.content}\n`,
    );
  }

  // ── 3. Edit-loop: EDIT_ITERATIONS rounds ─────────────────────────────────
  process.stdout.write(`\n\n[3] Edit-loop convergence (${EDIT_ITERATIONS} iterations)...\n`);

  const distByIteration: number[] = [];
  let prevDraft = draft0;

  for (let iter = 1; iter <= EDIT_ITERATIONS; iter++) {
    // Apply operator edits to previous draft and submit
    let totalDist = 0;
    for (const section of SECTIONS) {
      const s = prevDraft[section];
      if (!s) continue;
      const preferred = applyEdit(section, s.content);
      const dist = wordDist(s.content, preferred);
      totalDist += dist;
      if (dist > 0) await submitEdit(s.draftId, section, preferred);
    }
    distByIteration.push(totalDist);

    // Regenerate with learned signals
    prevDraft = await generateDraft(ingest.documentId);
  }

  // Print latest draft
  process.stdout.write(`\n${hr()}\nFINAL DRAFT (after ${EDIT_ITERATIONS} edit-loop iterations)\n${hr()}`);
  for (const section of SECTIONS) {
    const s = prevDraft[section];
    if (!s) continue;
    process.stdout.write(
      `\n\n§ ${SECTION_LABELS[section]}  (grounding: ${fmt(s.groundingScore)}  citations: ${s.citations.length})\n${hr("·")}\n${s.content}\n`,
    );
  }

  // ── 4. Convergence table ──────────────────────────────────────────────────
  process.stdout.write(`\n\n[4] Edit-loop convergence (distance to operator-preferred form)\n`);
  process.stdout.write(`${"Iteration".padEnd(12)}  ${"Dist to Preferred".padEnd(20)}  Δ from Previous\n`);
  process.stdout.write(hr() + "\n");

  for (const [i, dist] of distByIteration.entries()) {
    const prev = i === 0 ? null : distByIteration[i - 1];
    const delta = prev === null ? "—"
      : dist < prev ? `↓ ${pct(prev - dist, prev)} reduction`
      : dist > prev ? `↑ ${pct(dist - prev, prev)} increase`
      : "= no change";
    process.stdout.write(`${String(i + 1).padEnd(12)}  ${String(dist).padEnd(20)}  ${delta}\n`);
  }

  process.stdout.write(hr() + "\n");

  const startDist = distByIteration[0] ?? 0;
  const endDist = distByIteration[distByIteration.length - 1] ?? 0;
  const convergencePct = startDist > 0 ? ((startDist - endDist) / startDist) * 100 : 0;
  const convergenceDir = startDist === 0 ? "—"
    : convergencePct > 0 ? `↓ ${convergencePct.toFixed(0)}% reduction over ${EDIT_ITERATIONS} iterations`
    : convergencePct < 0 ? `↑ ${(-convergencePct).toFixed(0)}% increase`
    : "= no change";

  process.stdout.write(`TOTAL  ${startDist} → ${endDist}  ${convergenceDir}\n`);
  process.stdout.write(`Grounding: ${fmt(meanGrounding)}\n`);

  return {
    filename,
    ocrStrategy: ingest.ocrStrategy,
    fieldsExtracted,
    meanGrounding,
    convergencePct,
    distByIteration,
  };
}

// ── Aggregate table ───────────────────────────────────────────────────────────

function printAggregate(results: DocSummary[]): void {
  process.stdout.write(`\n\n${hr("═")}\nAGGREGATE RESULTS\n${hr("═")}\n\n`);
  process.stdout.write(
    `${"Document".padEnd(36)}  ${"OCR Strategy".padEnd(22)}  ${"Fields".padEnd(8)}  ${"Grounding".padEnd(10)}  Convergence\n`,
  );
  process.stdout.write("─".repeat(105) + "\n");

  for (const r of results) {
    const convStr = r.distByIteration[0] === 0 ? "—"
      : r.convergencePct > 0 ? `↓ ${r.convergencePct.toFixed(0)}%`
      : r.convergencePct < 0 ? `↑ ${(-r.convergencePct).toFixed(0)}%`
      : "=";

    process.stdout.write(
      `${r.filename.padEnd(36)}  ${r.ocrStrategy.padEnd(22)}  ${(r.fieldsExtracted ? "✓" : "✗").padEnd(8)}  ${fmt(r.meanGrounding).padEnd(10)}  ${convStr}\n`,
    );
  }

  process.stdout.write("\n");
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  process.stdout.write(`\n${hr("═")}\nLegal RAG — E2E Walkthrough\n${hr("═")}\n`);
  process.stdout.write(`API: ${API_URL}   Files: ${FILES_TO_RUN.map(f => path.basename(f)).join(", ")}\n`);
  process.stdout.write(`Edit-loop iterations per document: ${EDIT_ITERATIONS}\n`);

  const results: DocSummary[] = [];

  for (const [i, filePath] of FILES_TO_RUN.entries()) {
    const summary = await runDocument(filePath, i, FILES_TO_RUN.length);
    results.push(summary);
  }

  if (results.length > 1) {
    printAggregate(results);
  }

  process.stdout.write(`${hr("═")}\nDemo complete.\n${hr("═")}\n\n`);
}

main().catch(err => {
  process.stderr.write(`\nFatal: ${String(err)}\n`);
  process.stderr.write("Check: docker compose up -d\n\n");
  process.exit(1);
});
