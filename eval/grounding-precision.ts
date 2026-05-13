/**
 * Grounding precision evaluation for generated Case Fact Summary drafts.
 *
 * Measurement unit: one section (matching the demo's grounding-verifier.ts).
 * For each section:
 *   - Refusal lines ("Not specified in source documents.") are detected and
 *     stripped from the content before embedding; refusal sections are excluded
 *     from the precision denominator and reported separately.
 *   - The full non-refusal section content is embedded (citation markers stripped).
 *   - Max cosine similarity to any cited chunk embedding is computed.
 *   - Section is "grounded" if max similarity ≥ GROUNDING_THRESHOLD (0.65).
 *
 * This matches the approach used by apps/api/src/pipeline/grounding-verifier.ts
 * so that eval scores are directly comparable to demo-reported per-section scores.
 *
 * Usage: tsx eval/grounding-precision.ts [--document-id UUID]
 *
 * @author Al Amin Ahamed
 */

import "dotenv/config";
import postgres from "postgres";
import OpenAI from "openai";

const DATABASE_URL = process.env["DATABASE_URL"] ?? "postgres://legal:secret@localhost:5432/legalrag";
const OPENAI_API_KEY = process.env["OPENAI_API_KEY"] ?? "";
const OPENAI_EMBEDDING_MODEL = process.env["OPENAI_EMBEDDING_MODEL"] ?? "text-embedding-3-small";

/**
 * Cosine similarity threshold for a section to be considered "grounded".
 * 0.65 matches the empirical range observed in demo grounding scores and
 * separates on-topic paraphrases from hallucinated/off-topic content.
 */
export const GROUNDING_THRESHOLD = 0.65;

const REFUSAL_MARKER = "Not specified in source documents";
const CITE_RE = /\[c:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]/g;

const DOC_ID_ARG = (() => {
  const idx = process.argv.indexOf("--document-id");
  return idx >= 0 ? process.argv[idx + 1] : undefined;
})();

const db = postgres(DATABASE_URL, { max: 3 });
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SectionMetrics {
  section: string;
  totalLines: number;
  refusalsCount: number;
  sentencesWithCitation: number;
  sentencesWithValidCitation: number;
  sentencesSupported: number;
  meanSimilarity: number;
  maxSimilarity: number;
  citationCoverage: number;
  citationValidity: number;
  groundingPrecision: number;
  isRefusalSection: boolean;
}

export interface GroundingResult {
  documentId: string;
  filename: string;
  sections: SectionMetrics[];
  overall: {
    citationCoverage: number;
    citationValidity: number;
    groundingPrecision: number;
    refusalRate: number;
    meanSimilarity: number;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function stripCitations(text: string): string {
  return text.replace(new RegExp(CITE_RE.source, "g"), "").trim();
}

function extractCitationIds(text: string): string[] {
  return [...text.matchAll(new RegExp(CITE_RE.source, "g"))]
    .map(m => m[1])
    .filter((id): id is string => id !== undefined);
}

function isRefusalContent(content: string): boolean {
  return content.trim().startsWith(REFUSAL_MARKER);
}

function parseVector(raw: unknown): number[] {
  if (!raw || typeof raw !== "string") return [];
  return raw.slice(1, -1).split(",").map(Number).filter(n => !isNaN(n));
}

function cosineSim(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i] ?? 0, bi = b[i] ?? 0;
    dot += ai * bi; na += ai * ai; nb += bi * bi;
  }
  return na === 0 || nb === 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const res = await openai.embeddings.create({
    model: OPENAI_EMBEDDING_MODEL,
    input: texts,
    encoding_format: "float",
  });
  return res.data.sort((a, b) => a.index - b.index).map(d => d.embedding);
}

// ── Core evaluator ────────────────────────────────────────────────────────────

/**
 * Evaluates grounding precision for all latest draft sections of a document.
 *
 * Grounding is measured at section level — the full section text is embedded
 * and compared to cited chunk embeddings via cosine similarity. This matches
 * apps/api/src/pipeline/grounding-verifier.ts so that eval scores are
 * directly comparable to the demo's per-section grounding scores.
 *
 * Refusal sections ("Not specified in source documents.") are excluded from
 * the precision denominator and reported separately as `refusalRate`.
 *
 * @param documentId - UUID of document to evaluate
 * @returns Grounding metrics per section and overall
 * @author Al Amin Ahamed
 */
export async function evaluateGrounding(documentId: string): Promise<GroundingResult> {
  const docRows = await db<Array<{ filename: string }>>`
    SELECT filename FROM documents WHERE id = ${documentId}
  `;
  const filename = docRows[0]?.filename ?? documentId;

  const draftRows = await db<Array<{ id: string; section: string; content: string }>>`
    SELECT DISTINCT ON (section) id, section, content
    FROM drafts
    WHERE document_id = ${documentId}
    ORDER BY section, generated_at DESC
  `;

  if (draftRows.length === 0) {
    return {
      documentId, filename, sections: [],
      overall: { citationCoverage: 0, citationValidity: 0, groundingPrecision: 0, refusalRate: 0, meanSimilarity: 0 },
    };
  }

  // Collect cited chunks across all non-refusal sections
  const allChunkIds = new Set<string>();
  const sectionData = draftRows.map(draft => {
    const isRefusal = isRefusalContent(draft.content);
    const citationIds = isRefusal ? [] : extractCitationIds(draft.content);
    const cleanedText = isRefusal ? "" : stripCitations(draft.content).replace(/\n+/g, " ").trim();
    citationIds.forEach(id => allChunkIds.add(id));
    return { ...draft, isRefusal, citationIds, cleanedText };
  });

  // Batch embed all non-refusal section texts
  const toEmbed = sectionData.filter(s => !s.isRefusal && s.cleanedText.length > 0);
  let embeddings: number[][] = [];
  if (toEmbed.length > 0 && OPENAI_API_KEY) {
    try {
      embeddings = await embedBatch(toEmbed.map(s => s.cleanedText));
    } catch (err) {
      process.stderr.write(`Embedding failed: ${String(err)}\n`);
    }
  }
  const sectionEmbMap = new Map<string, number[]>();
  for (const [i, s] of toEmbed.entries()) {
    const emb = embeddings[i];
    if (emb) sectionEmbMap.set(s.id, emb);
  }

  // Fetch chunk embeddings
  const chunkEmbMap = new Map<string, number[]>();
  const chunkIdList = [...allChunkIds];
  if (chunkIdList.length > 0) {
    const rows = await db<Array<{ id: string; embedding: unknown }>>`
      SELECT id, embedding::text AS embedding FROM chunks WHERE id = ANY(${chunkIdList})
    `;
    for (const row of rows) chunkEmbMap.set(row.id, parseVector(row.embedding));
  }

  // Compute per-section metrics
  const sectionMetrics: SectionMetrics[] = [];
  let ttlNonRefusal = 0, ttlGrounded = 0, ttlRefusal = 0;
  let ttlSimSum = 0, ttlSimCount = 0;

  for (const s of sectionData) {
    const lines = s.content.split(/\n/).filter(l => l.trim().length > 3).length;
    const refusals = s.isRefusal ? lines : 0;

    if (s.isRefusal) {
      ttlRefusal++;
      sectionMetrics.push({
        section: s.section,
        totalLines: lines,
        refusalsCount: refusals,
        sentencesWithCitation: 0,
        sentencesWithValidCitation: 0,
        sentencesSupported: 0,
        meanSimilarity: 0,
        maxSimilarity: 0,
        citationCoverage: 0,
        citationValidity: 0,
        groundingPrecision: 0,
        isRefusalSection: true,
      });
      continue;
    }

    ttlNonRefusal++;
    const sectionEmb = sectionEmbMap.get(s.id) ?? [];
    const anyValid = s.citationIds.some(id => chunkEmbMap.has(id));
    let maxSim = 0;
    let simSum = 0, simCount = 0;

    for (const id of s.citationIds) {
      const chunkEmb = chunkEmbMap.get(id);
      if (!chunkEmb) continue;
      const sim = cosineSim(sectionEmb, chunkEmb);
      if (sim > maxSim) maxSim = sim;
      simSum += sim; simCount++;
    }

    const grounded = s.citationIds.length > 0 && maxSim >= GROUNDING_THRESHOLD;
    if (grounded) ttlGrounded++;
    if (simCount > 0) { ttlSimSum += maxSim; ttlSimCount++; }

    sectionMetrics.push({
      section: s.section,
      totalLines: lines,
      refusalsCount: 0,
      sentencesWithCitation: s.citationIds.length > 0 ? 1 : 0,
      sentencesWithValidCitation: anyValid ? 1 : 0,
      sentencesSupported: grounded ? 1 : 0,
      meanSimilarity: simCount > 0 ? simSum / simCount : 0,
      maxSimilarity: maxSim,
      citationCoverage: s.citationIds.length > 0 ? 1.0 : 0,
      citationValidity: s.citationIds.length > 0 && anyValid ? 1.0 : 0,
      groundingPrecision: grounded ? 1.0 : 0,
      isRefusalSection: false,
    });
  }

  const total = draftRows.length;
  const groundingPrecision = ttlNonRefusal > 0 ? ttlGrounded / ttlNonRefusal : 0;
  const meanSim = ttlSimCount > 0 ? ttlSimSum / ttlSimCount : 0;

  return {
    documentId, filename,
    sections: sectionMetrics,
    overall: {
      citationCoverage: ttlNonRefusal > 0 ? sectionMetrics.filter(s => !s.isRefusalSection && s.sentencesWithCitation > 0).length / ttlNonRefusal : 0,
      citationValidity: ttlNonRefusal > 0 ? sectionMetrics.filter(s => !s.isRefusalSection && s.sentencesWithValidCitation > 0).length / ttlNonRefusal : 0,
      groundingPrecision,
      refusalRate: total > 0 ? ttlRefusal / total : 0,
      meanSimilarity: meanSim,
    },
  };
}

// ── CLI runner ────────────────────────────────────────────────────────────────

function fmt(n: number): string { return (n * 100).toFixed(1) + "%"; }

async function main(): Promise<void> {
  process.stdout.write("=== Grounding Precision Evaluation ===\n");
  process.stdout.write(`Threshold: cosine ≥ ${GROUNDING_THRESHOLD} | Refusal sections excluded | Section-level scoring\n\n`);

  let docIds: string[];
  if (DOC_ID_ARG) {
    docIds = [DOC_ID_ARG];
  } else {
    const docs = await db<Array<{ id: string }>>`SELECT id FROM documents ORDER BY created_at LIMIT 5`;
    docIds = docs.map(d => d.id);
  }

  if (docIds.length === 0) {
    process.stderr.write("No documents found. Ingest samples first.\n");
    process.exit(1);
  }

  for (const docId of docIds) {
    const result = await evaluateGrounding(docId);
    process.stdout.write(`\nDocument: ${result.filename}\n`);
    process.stdout.write(`${"Section".padEnd(24)}  ${"Refusal".padEnd(9)}  ${"MaxSim".padEnd(8)}  Grounded\n`);
    process.stdout.write("-".repeat(58) + "\n");

    for (const s of result.sections) {
      const groundedStr = s.isRefusalSection ? "(excluded)" : s.groundingPrecision >= 1 ? "✓" : "✗";
      process.stdout.write(
        `${s.section.padEnd(24)}  ${(s.isRefusalSection ? "yes" : "no").padEnd(9)}  ${fmt(s.maxSimilarity).padEnd(8)}  ${groundedStr}\n`,
      );
    }
    process.stdout.write("-".repeat(58) + "\n");
    process.stdout.write(
      `${"OVERALL".padEnd(24)}  ${fmt(result.overall.refusalRate).padEnd(9)}  ${fmt(result.overall.meanSimilarity).padEnd(8)}  ${fmt(result.overall.groundingPrecision)}\n`,
    );
  }

  await db.end();
}

if (process.argv[1]?.endsWith("grounding-precision.ts") || process.argv[1]?.endsWith("grounding-precision.js")) {
  main().catch(err => { process.stderr.write(String(err) + "\n"); process.exit(1); });
}
