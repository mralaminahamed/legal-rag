import { sql } from "../db/client.js";
import { embedTexts } from "./embed.js";
import type { RetrievedChunk } from "../types.js";

const SNIPPET_LENGTH = 200;
const DEFAULT_TOP_K = 8;
const RRF_K = 60;

/** Intermediate ranked item before snippet is added. */
interface RankedItem {
  id: string;
  text: string;
  page_number: number | null;
  score: number;
}

/**
 * Retrieves top-K chunks by cosine similarity between the query embedding
 * and stored chunk embeddings. Score is cosine similarity in [0, 1].
 *
 * @param documentId - UUID of the target document
 * @param queryEmbedding - 1536-dim float array from OpenAI
 * @param topK - Maximum results to return
 * @returns Ranked chunks, best first
 * @throws {Error} When database query or embedding API call fails
 * @author Al Amin Ahamed
 */
export async function vectorSearch(
  documentId: string,
  queryEmbedding: number[],
  topK: number = DEFAULT_TOP_K,
): Promise<RankedItem[]> {
  const embStr = `[${queryEmbedding.join(",")}]`;

  const rows = await sql<
    Array<{ id: string; text: string; page_number: number | null; score: number }>
  >`
    SELECT
      id,
      text,
      page_number,
      1 - (embedding <=> ${embStr}::vector) AS score
    FROM chunks
    WHERE document_id = ${documentId}
    ORDER BY embedding <=> ${embStr}::vector
    LIMIT ${topK}
  `;

  return rows.map((r) => ({
    id: r.id,
    text: r.text,
    page_number: r.page_number,
    score: r.score,
  }));
}

/**
 * Retrieves top-K chunks using Postgres full-text search (ts_rank_cd).
 * Only chunks whose tsvector matches the query are returned.
 *
 * @param documentId - UUID of the target document
 * @param queryText - Natural-language query string
 * @param topK - Maximum results to return
 * @returns Ranked chunks, best first
 * @throws {Error} When database query fails
 * @author Al Amin Ahamed
 */
export async function fullTextSearch(
  documentId: string,
  queryText: string,
  topK: number = DEFAULT_TOP_K,
): Promise<RankedItem[]> {
  const rows = await sql<
    Array<{ id: string; text: string; page_number: number | null; score: number }>
  >`
    SELECT
      id,
      text,
      page_number,
      ts_rank_cd(
        to_tsvector('english', text),
        plainto_tsquery('english', ${queryText})
      ) AS score
    FROM chunks
    WHERE document_id = ${documentId}
      AND to_tsvector('english', text) @@ plainto_tsquery('english', ${queryText})
    ORDER BY score DESC
    LIMIT ${topK}
  `;

  return rows.map((r) => ({
    id: r.id,
    text: r.text,
    page_number: r.page_number,
    score: r.score,
  }));
}

/**
 * Merges multiple ranked lists using Reciprocal Rank Fusion.
 * Formula: score(d) = Σ 1 / (k + rank(d)) over all lists.
 * Scores are normalized to [0, 1] by dividing by the maximum.
 *
 * @param lists - Array of ranked result lists (each sorted best-first)
 * @param k - RRF constant (default 60, per standard literature)
 * @returns Single merged list sorted by RRF score, normalized to [0, 1]
 * @throws {never}
 * @author Al Amin Ahamed
 */
export function reciprocalRankFusion(
  lists: RankedItem[][],
  k: number = RRF_K,
): RankedItem[] {
  const scores = new Map<string, { score: number; item: RankedItem }>();

  for (const list of lists) {
    for (const [rank, item] of list.entries()) {
      const rrf = 1 / (k + rank + 1);
      const existing = scores.get(item.id);
      if (existing) {
        existing.score += rrf;
      } else {
        scores.set(item.id, { score: rrf, item });
      }
    }
  }

  const merged = [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .map(({ score, item }) => ({ ...item, score }));

  const maxScore = merged[0]?.score ?? 1;
  return merged.map((r) => ({ ...r, score: r.score / maxScore }));
}

/**
 * Hybrid retrieval for a single query string: embeds the query, runs
 * vector search and full-text search in parallel, merges via RRF.
 *
 * @param documentId - UUID of the target document
 * @param queryText - Natural-language query string
 * @param topK - Final result count after merging
 * @returns Top-K chunks with normalized RRF scores and snippets
 * @throws {Error} When embedding call fails
 * @author Al Amin Ahamed
 */
export async function hybridRetrieve(
  documentId: string,
  queryText: string,
  topK: number = DEFAULT_TOP_K,
): Promise<RetrievedChunk[]> {
  const [embedding] = await embedTexts([queryText]);
  if (!embedding) throw new Error("Embedding returned empty result for query");

  const [vectorResults, ftsResults] = await Promise.all([
    vectorSearch(documentId, embedding, topK),
    fullTextSearch(documentId, queryText, topK),
  ]);

  const merged = reciprocalRankFusion([vectorResults, ftsResults], RRF_K);

  return merged.slice(0, topK).map((r) => ({
    id: r.id,
    text: r.text,
    page_number: r.page_number,
    score: r.score,
    snippet: r.text.slice(0, SNIPPET_LENGTH),
  }));
}

/**
 * Runs hybridRetrieve for every query string in a section's query list,
 * then merges all result lists via a final RRF pass.
 *
 * @param documentId - UUID of the target document
 * @param queries - Section-specific query strings from SECTION_QUERIES
 * @param topK - Final result count
 * @returns Top-K deduplicated chunks, normalized to [0, 1]
 * @throws {Error} When embedding API call or database query fails
 * @author Al Amin Ahamed
 */
export async function retrieveForSection(
  documentId: string,
  queries: string[],
  topK: number = DEFAULT_TOP_K,
): Promise<RetrievedChunk[]> {
  if (queries.length === 0) return [];

  if (queries.length === 1) {
    return hybridRetrieve(documentId, queries[0] ?? "", topK);
  }

  const perQueryResults = await Promise.all(
    queries.map((q) => hybridRetrieve(documentId, q, topK)),
  );

  const asRankedLists: RankedItem[][] = perQueryResults.map((list) =>
    list.map(({ id, text, page_number, score }) => ({
      id,
      text,
      page_number,
      score,
    })),
  );

  const merged = reciprocalRankFusion(asRankedLists, RRF_K);

  return merged.slice(0, topK).map((r) => ({
    id: r.id,
    text: r.text,
    page_number: r.page_number,
    score: r.score,
    snippet: r.text.slice(0, SNIPPET_LENGTH),
  }));
}
