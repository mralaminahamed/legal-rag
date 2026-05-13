/**
 * Semantic chunking via embedding-distance breakpoints.
 *
 * Algorithm credit: Greg Kamradt (NLP / chunking research).
 * TypeScript implementation pattern inspired by:
 *   https://github.com/tsensei/Semantic-Chunking-Typescript
 *
 * @author Al Amin Ahamed
 */

import { embedTexts } from "./embed.js";
import type { Chunk } from "../types.js";

const MIN_CHUNK_CHARS = 100;
const BREAKPOINT_PERCENTILE = 95;
const BREAKPOINT_ABSOLUTE = 0.35;

/**
 * Splits raw text into semantically coherent chunks using embedding-distance
 * breakpoints. Groups of sentences with low cosine distance stay together;
 * groups with high distance (95th-percentile OR > 0.35) are split.
 * Short chunks under 100 chars are merged with their neighbor.
 *
 * @param rawText - Full document text from OCR
 * @returns Array of Chunk objects with text, sentenceCount, charCount
 * @author Al Amin Ahamed
 */
export async function chunkDocument(rawText: string): Promise<Chunk[]> {
  const sentences = splitSentences(rawText);
  if (sentences.length === 0) return [];
  if (sentences.length === 1) {
    const text = sentences[0] ?? "";
    return [{ text, sentenceCount: 1, charCount: text.length }];
  }

  const embeddings = await embedTexts(sentences);

  const distances: number[] = [];
  for (let i = 1; i < embeddings.length; i++) {
    const prev = embeddings[i - 1];
    const curr = embeddings[i];
    if (!prev || !curr) {
      distances.push(0);
      continue;
    }
    distances.push(cosineDistance(prev, curr));
  }

  const threshold = Math.min(
    percentile(distances, BREAKPOINT_PERCENTILE),
    BREAKPOINT_ABSOLUTE,
  );

  const breakpoints = new Set<number>();
  for (let i = 0; i < distances.length; i++) {
    const d = distances[i] ?? 0;
    if (d >= threshold) {
      breakpoints.add(i + 1);
    }
  }

  const rawChunks = groupSentences(sentences, breakpoints);
  return mergeShortChunks(rawChunks, MIN_CHUNK_CHARS);
}

/**
 * Splits text into sentences on `.!?` boundaries followed by whitespace
 * and an uppercase letter. Applies a heuristic to avoid splitting after
 * common abbreviations (Mr., Dr., vs., U.S., etc.).
 *
 * @param text - Input text
 * @returns Array of sentence strings
 * @author Al Amin Ahamed
 */
function splitSentences(text: string): string[] {
  const ABBREV = /\b(Mr|Mrs|Ms|Dr|Prof|Jr|Sr|vs|et|al|No|Vol|Nos|Sec|Art|Para|Inc|Corp|Ltd|Co|U\.S|e\.g|i\.e|etc)\s*$/i;

  const parts = text.split(/(?<=[.!?])\s+(?=[A-Z"'])/);
  const merged: string[] = [];
  let pending = "";

  for (const part of parts) {
    pending = pending ? `${pending} ${part}` : part;
    if (ABBREV.test(pending.trim())) continue;
    merged.push(pending.trim());
    pending = "";
  }
  if (pending.trim()) merged.push(pending.trim());

  return merged.filter((s) => s.length > 0);
}

/**
 * Computes cosine distance (1 − similarity) between two equal-length vectors.
 *
 * @param a - First embedding vector
 * @param b - Second embedding vector
 * @returns Distance in [0, 2]; returns 1 for zero-magnitude vectors
 * @author Al Amin Ahamed
 */
function cosineDistance(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  if (normA === 0 || normB === 0) return 1;
  return 1 - dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Returns the p-th percentile value from an array of numbers.
 *
 * @param values - Input array
 * @param p - Percentile in [0, 100]
 * @returns The p-th percentile value, or 0 for empty input
 * @author Al Amin Ahamed
 */
function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)] ?? 0;
}

/**
 * Groups consecutive sentences into chunks, splitting at breakpoint indices.
 *
 * @param sentences - Flat array of sentence strings
 * @param breakpoints - Set of indices where a new chunk should begin
 * @returns Array of Chunk objects (pre-merge)
 * @author Al Amin Ahamed
 */
function groupSentences(
  sentences: string[],
  breakpoints: Set<number>,
): Chunk[] {
  const chunks: Chunk[] = [];
  let group: string[] = [];

  for (let i = 0; i < sentences.length; i++) {
    if (breakpoints.has(i) && group.length > 0) {
      chunks.push(buildChunk(group));
      group = [];
    }
    const sentence = sentences[i];
    if (sentence !== undefined) group.push(sentence);
  }
  if (group.length > 0) chunks.push(buildChunk(group));

  return chunks;
}

/**
 * Merges any chunk shorter than minChars into its preceding neighbor.
 * The last chunk merges forward if it is also the first.
 *
 * @param chunks - Input chunks (may contain short ones)
 * @param minChars - Minimum acceptable character count per chunk
 * @returns Chunks with none shorter than minChars (unless the whole document is short)
 * @author Al Amin Ahamed
 */
function mergeShortChunks(chunks: Chunk[], minChars: number): Chunk[] {
  if (chunks.length <= 1) return chunks;

  const result: Chunk[] = [];
  for (const chunk of chunks) {
    const last = result[result.length - 1];
    if (last && (last.charCount < minChars || chunk.charCount < minChars)) {
      result[result.length - 1] = buildChunk([last.text, chunk.text]);
    } else {
      result.push(chunk);
    }
  }
  return result;
}

function buildChunk(sentences: string[]): Chunk {
  const text = sentences.join(" ").trim();
  return { text, sentenceCount: sentences.length, charCount: text.length };
}
