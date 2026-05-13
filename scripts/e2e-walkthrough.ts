/**
 * End-to-end demo walkthrough.
 *
 * Usage:
 *   npm run demo                        → default: 01-clean-complaint.pdf
 *   npm run demo -- --all               → all three samples sequentially
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
const ALL_SAMPLES = [
  path.join(SAMPLES_DIR, "01-clean-complaint.pdf"),
  path.join(SAMPLES_DIR, "02-scanned-notice.pdf"),
  path.join(SAMPLES_DIR, "03-low-quality-contract.pdf"),
];

const FILES_TO_RUN: string[] = RUN_ALL
  ? ALL_SAMPLES
  : [CUSTOM_FILE ?? DEFAULT_PDF];

const API_URL = process.env["API_URL"] ?? "http://localhost:3000";

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
  meanGrounding1: number;
  meanGrounding2: number;
  totalDist1: number;
  totalDist2: number;
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
  form.append("file", new Blob([bytes], { type: "application/pdf" }), filename);
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

  // ── 2. Draft 1 ────────────────────────────────────────────────────────────
  process.stdout.write("\n[2] Generating draft 1...\n");
  const draft1 = await generateDraft(ingest.documentId);

  const meanGrounding1 =
    SECTIONS.reduce((s, k) => s + (draft1[k]?.groundingScore ?? 0), 0) / SECTIONS.length;
  process.stdout.write(`    Mean grounding: ${fmt(meanGrounding1)}\n`);

  // Print draft 1
  process.stdout.write(`\n${hr()}\nDRAFT 1\n${hr()}`);
  for (const section of SECTIONS) {
    const s = draft1[section];
    if (!s) continue;
    process.stdout.write(
      `\n\n§ ${SECTION_LABELS[section]}  (grounding: ${fmt(s.groundingScore)}  citations: ${s.citations.length})\n${hr("·")}\n${s.content}\n`,
    );
  }

  // ── 3. Apply operator edits ───────────────────────────────────────────────
  process.stdout.write(`\n\n[3] Applying operator edits...\n`);
  let totalDist1 = 0;

  for (const section of SECTIONS) {
    const s = draft1[section];
    if (!s) continue;
    const preferred = applyEdit(section, s.content);
    const dist = wordDist(s.content, preferred);
    totalDist1 += dist;
    if (dist > 0) {
      await submitEdit(s.draftId, section, preferred);
    }
    process.stdout.write(`    ${section.padEnd(22)}: dist=${dist}\n`);
  }

  // ── 4. Draft 2 ────────────────────────────────────────────────────────────
  process.stdout.write("\n[4] Regenerating with learned signals...\n");
  const draft2 = await generateDraft(ingest.documentId);

  const meanGrounding2 =
    SECTIONS.reduce((s, k) => s + (draft2[k]?.groundingScore ?? 0), 0) / SECTIONS.length;
  process.stdout.write(`    Mean grounding: ${fmt(meanGrounding2)}\n`);

  // Print draft 2
  process.stdout.write(`\n${hr()}\nDRAFT 2 (after edit-loop signals)\n${hr()}`);
  for (const section of SECTIONS) {
    const s = draft2[section];
    if (!s) continue;
    process.stdout.write(
      `\n\n§ ${SECTION_LABELS[section]}  (grounding: ${fmt(s.groundingScore)}  citations: ${s.citations.length})\n${hr("·")}\n${s.content}\n`,
    );
  }

  // ── 5. Before / after comparison ─────────────────────────────────────────
  process.stdout.write(`\n\n[5] Comparison (distance to operator-preferred form)\n`);
  process.stdout.write(`${"Section".padEnd(24)}  ${"Dist1".padEnd(8)}  ${"Dist2".padEnd(8)}  Direction\n`);
  process.stdout.write(hr() + "\n");

  let totalDist2 = 0;

  for (const section of SECTIONS) {
    const s1 = draft1[section];
    const s2 = draft2[section];
    if (!s1 || !s2) continue;

    const pref2 = applyEdit(section, s2.content);
    const d1 = wordDist(s1.content, applyEdit(section, s1.content));
    const d2 = wordDist(s2.content, pref2);
    const delta = d2 - d1;
    totalDist2 += d2;

    const dir = d1 === 0 ? "—" : delta < 0
      ? `↓ ${pct(-delta, d1)} reduction`
      : delta > 0 ? `↑ ${pct(delta, d1)} increase`
      : "= no change";

    process.stdout.write(`${section.padEnd(24)}  ${String(d1).padEnd(8)}  ${String(d2).padEnd(8)}  ${dir}\n`);
  }

  process.stdout.write(hr() + "\n");
  const totalDelta = totalDist2 - totalDist1;
  const totalDir = totalDist1 === 0 ? "—"
    : totalDelta < 0 ? `↓ ${pct(-totalDelta, totalDist1)} reduction`
    : totalDelta > 0 ? `↑ ${pct(totalDelta, totalDist1)} increase`
    : "= no change";

  process.stdout.write(`${"TOTAL".padEnd(24)}  ${String(totalDist1).padEnd(8)}  ${String(totalDist2).padEnd(8)}  ${totalDir}\n`);
  process.stdout.write(`Grounding: ${fmt(meanGrounding1)} → ${fmt(meanGrounding2)}\n`);

  return {
    filename,
    ocrStrategy: ingest.ocrStrategy,
    fieldsExtracted,
    meanGrounding1,
    meanGrounding2,
    totalDist1,
    totalDist2,
  };
}

// ── Aggregate table ───────────────────────────────────────────────────────────

function printAggregate(results: DocSummary[]): void {
  process.stdout.write(`\n\n${hr("═")}\nAGGREGATE RESULTS\n${hr("═")}\n\n`);
  process.stdout.write(
    `${"Document".padEnd(34)}  ${"OCR Strategy".padEnd(20)}  ${"Fields".padEnd(8)}  ${"Grounding".padEnd(12)}  Edit Δ\n`,
  );
  process.stdout.write("─".repeat(100) + "\n");

  for (const r of results) {
    const grounding = `${fmt(r.meanGrounding1)}→${fmt(r.meanGrounding2)}`;
    const delta = r.totalDist2 - r.totalDist1;
    const dir = r.totalDist1 === 0 ? "—"
      : delta < 0 ? `↓ ${pct(-delta, r.totalDist1)}`
      : delta > 0 ? `↑ ${pct(delta, r.totalDist1)}`
      : "=";

    process.stdout.write(
      `${r.filename.padEnd(34)}  ${r.ocrStrategy.padEnd(20)}  ${(r.fieldsExtracted ? "✓" : "✗").padEnd(8)}  ${grounding.padEnd(12)}  ${dir}\n`,
    );
  }

  process.stdout.write("\n");
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  process.stdout.write(`\n${hr("═")}\nLegal RAG — E2E Walkthrough\n${hr("═")}\n`);
  process.stdout.write(`API: ${API_URL}   Files: ${FILES_TO_RUN.map(f => path.basename(f)).join(", ")}\n`);

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
