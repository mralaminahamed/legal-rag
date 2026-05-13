/**
 * Shared domain types used across the ingestion and generation pipeline.
 *
 * @author Al Amin Ahamed
 */

export interface DocumentFields {
  document_type: string | null;
  parties: {
    plaintiffs: string[];
    defendants: string[];
    counsel: string[];
  };
  key_dates: Array<{ label: string; iso_date: string }>;
}

export interface Chunk {
  text: string;
  sentenceCount: number;
  charCount: number;
}

export interface IngestResult {
  documentId: string;
  chunkCount: number;
  fields: DocumentFields;
  ocrConfidence: number;
  ocrStrategy: string;
}

export type CaseSummarySection =
  | "parties"
  | "key_dates"
  | "issues"
  | "procedural_history"
  | "relief";

/** A chunk returned from retrieval, with score and display snippet. */
export interface RetrievedChunk {
  id: string;
  text: string;
  page_number: number | null;
  score: number;
  snippet: string;
}

/** A citation stored inside a draft's citations JSONB column. */
export interface DraftCitation {
  chunk_id: string;
  snippet: string;
  score: number;
}

/** One generated section of a Case Fact Summary draft. */
export interface SectionDraft {
  draftId: string;
  content: string;
  citations: DraftCitation[];
  groundingScore: number;
}

/** Full five-section draft result returned by the generation pipeline. */
export interface DraftResult {
  documentId: string;
  sections: Record<CaseSummarySection, SectionDraft>;
  providerUsed: string;
}

// ── Edit-loop types ───────────────────────────────────────────────────────────

export interface DiffOp {
  kind: "equal" | "insert" | "delete" | "replace";
  originalRange: [number, number];
  editedRange: [number, number];
  originalText: string;
  editedText: string;
}

export interface DiffStats {
  wordsAdded: number;
  wordsRemoved: number;
  wordsReplaced: number;
  totalEditDistance: number;
}

export type EditClass =
  | "rephrase"
  | "factual_correction"
  | "formatting"
  | "omission"
  | "addition";

export interface EditClassification {
  class: EditClass;
  confidence: number;
  reasoning: string;
}

export interface StylePreferences {
  tone?: "formal" | "neutral" | "informal";
  avoid_phrases: string[];
  prefer_phrases: string[];
  formatting_rules: string[];
}
