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
