/**
 * Grounding precision evaluation for generated Case Fact Summary drafts.
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
const GROUNDING_THRESHOLD = 0.7;
const DOC_ID_ARG = (() => {
  const idx = process.argv.indexOf("--document-id");
  return idx >= 0 ? process.argv[idx + 1] : undefined;
})();

const db = postgres(DATABASE_URL, { max: 3 });
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SectionMetrics {
  section: string;
  totalSentences: number;
  sentencesWithCitation: number;
  sentencesWithValidCitation: number;
  sentencesSupported: number;
  citationCoverage: number;
  citationValidity: number;
  groundingPrecision: number;
}

export interface GroundingResult {
  documentId: string;
  filename: string;
  sections: SectionMetrics[];
  overall: {
    citationCoverage: number;
    citationValidity: number;
    groundingPrecision: number;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const CITE_RE = /\[c:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]/g;

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?\n])\s+/)
    .map(s => s.replace(CITE_RE, "").trim())
    .filter(s => s.length > 8);
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
 * For each sentence: checks citation presence, chunk validity, and cosine
 * similarity between sentence embedding and cited chunk embedding (> 0.7).
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

  // Fetch latest draft per section
  const draftRows = await db<Array<{ id: string; section: string; content: string; citations: unknown }>>`
    SELECT DISTINCT ON (section) id, section, content, citations
    FROM drafts
    WHERE document_id = ${documentId}
    ORDER BY section, generated_at DESC
  `;

  if (draftRows.length === 0) {
    process.stderr.write(`No drafts found for document ${documentId}\n`);
    return { documentId, filename, sections: [], overall: { citationCoverage: 0, citationValidity: 0, groundingPrecision: 0 } };
  }

  // Collect all (sentence, chunkId) pairs across all sections for batch embedding
  type SentenceRecord = { sectionIdx: number; sentIdx: number; text: string; chunkIds: string[] };
  const allSentences: SentenceRecord[] = [];
  const allChunkIds = new Set<string>();

  const sectionSentences: string[][] = [];

  for (const [sIdx, draft] of draftRows.entries()) {
    const sentences = splitSentences(draft.content);
    sectionSentences.push(sentences);

    for (const [stIdx, sentence] of sentences.entries()) {
      const citeMatches = [...draft.content.matchAll(
        new RegExp(`${sentence.slice(0, 30).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^.]*?((?:\\[c:[0-9a-f-]+\\])+)`, "g")
      )];
      const chunkIds = [...draft.content.matchAll(CITE_RE)]
        .filter(m => {
          const pos = m.index ?? 0;
          // approximate: citation within 300 chars of sentence
          const sentPos = draft.content.indexOf(sentence.slice(0, 20));
          return Math.abs(pos - sentPos) < 400;
        })
        .map(m => m[1])
        .filter((id): id is string => id !== undefined);

      if (chunkIds.length > 0) {
        allSentences.push({ sectionIdx: sIdx, sentIdx: stIdx, text: sentence, chunkIds });
        chunkIds.forEach(id => allChunkIds.add(id));
      }
    }
  }

  // Batch embed all sentences with citations
  const sentenceTexts = allSentences.map(s => s.text);
  let sentenceEmbeddings: number[][] = [];
  if (sentenceTexts.length > 0 && OPENAI_API_KEY) {
    try {
      sentenceEmbeddings = await embedBatch(sentenceTexts);
    } catch (err) {
      process.stderr.write(`Embedding failed: ${String(err)}\n`);
    }
  }

  // Fetch chunk embeddings from DB
  const chunkIdList = [...allChunkIds];
  const chunkEmbMap = new Map<string, number[]>();
  if (chunkIdList.length > 0) {
    const chunkRows = await db<Array<{ id: string; embedding: unknown }>>`
      SELECT id, embedding::text AS embedding FROM chunks WHERE id = ANY(${chunkIdList})
    `;
    for (const row of chunkRows) {
      chunkEmbMap.set(row.id, parseVector(row.embedding));
    }
  }

  // Build sentence→supported map
  const supportedMap = new Map<string, boolean>();
  for (const [i, sr] of allSentences.entries()) {
    const sentEmb = sentenceEmbeddings[i] ?? [];
    if (sentEmb.length === 0) continue;

    let supported = false;
    for (const chunkId of sr.chunkIds) {
      const chunkEmb = chunkEmbMap.get(chunkId);
      if (!chunkEmb || chunkEmb.length === 0) continue;
      if (cosineSim(sentEmb, chunkEmb) >= GROUNDING_THRESHOLD) {
        supported = true;
        break;
      }
    }
    supportedMap.set(`${sr.sectionIdx}:${sr.sentIdx}`, supported);
  }

  // Compute per-section metrics
  const sectionMetrics: SectionMetrics[] = [];
  let totalTotal = 0, totalWithCite = 0, totalValidCite = 0, totalSupported = 0;

  for (const [sIdx, draft] of draftRows.entries()) {
    const sentences = sectionSentences[sIdx] ?? [];
    let withCite = 0, validCite = 0, supported = 0;

    for (const [stIdx, sentence] of sentences.entries()) {
      const key = `${sIdx}:${stIdx}`;
      const sr = allSentences.find(s => s.sectionIdx === sIdx && s.sentIdx === stIdx);
      if (sr && sr.chunkIds.length > 0) {
        withCite++;
        // valid = at least one cited chunk exists in DB
        const anyExists = sr.chunkIds.some(id => chunkEmbMap.has(id));
        if (anyExists) validCite++;
        if (supportedMap.get(key) === true) supported++;
      }
    }

    const total = sentences.length;
    const m: SectionMetrics = {
      section: draft.section,
      totalSentences: total,
      sentencesWithCitation: withCite,
      sentencesWithValidCitation: validCite,
      sentencesSupported: supported,
      citationCoverage: total > 0 ? withCite / total : 0,
      citationValidity: withCite > 0 ? validCite / withCite : 0,
      groundingPrecision: total > 0 ? supported / total : 0,
    };
    sectionMetrics.push(m);

    totalTotal += total;
    totalWithCite += withCite;
    totalValidCite += validCite;
    totalSupported += supported;
  }

  return {
    documentId,
    filename,
    sections: sectionMetrics,
    overall: {
      citationCoverage: totalTotal > 0 ? totalWithCite / totalTotal : 0,
      citationValidity: totalWithCite > 0 ? totalValidCite / totalWithCite : 0,
      groundingPrecision: totalTotal > 0 ? totalSupported / totalTotal : 0,
    },
  };
}

// ── CLI runner ────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return (n * 100).toFixed(1) + "%";
}

async function main(): Promise<void> {
  process.stdout.write("=== Grounding Precision Evaluation ===\n\n");

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
    process.stdout.write(`\nDocument: ${result.filename} (${result.documentId.slice(0, 8)}...)\n`);
    process.stdout.write(`${"Section".padEnd(24)}  Coverage  Validity  Grounding\n`);
    process.stdout.write("-".repeat(64) + "\n");

    for (const s of result.sections) {
      process.stdout.write(
        `${s.section.padEnd(24)}  ${fmt(s.citationCoverage).padEnd(10)}${fmt(s.citationValidity).padEnd(10)}${fmt(s.groundingPrecision)}\n`,
      );
    }
    process.stdout.write("-".repeat(64) + "\n");
    process.stdout.write(
      `${"OVERALL".padEnd(24)}  ${fmt(result.overall.citationCoverage).padEnd(10)}${fmt(result.overall.citationValidity).padEnd(10)}${fmt(result.overall.groundingPrecision)}\n`,
    );
  }

  await db.end();
}

if (process.argv[1]?.endsWith("grounding-precision.ts") || process.argv[1]?.endsWith("grounding-precision.js")) {
  main().catch(err => { process.stderr.write(String(err) + "\n"); process.exit(1); });
}
