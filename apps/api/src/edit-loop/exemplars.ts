import { sql } from "../db/client.js";
import { embedTexts } from "../pipeline/embed.js";
import { logger } from "../lib/logger.js";
import type { DiffStats, EditClass, EditClassification } from "../types.js";

/**
 * Computes a signal score for an edit based on its classification and
 * word-count deltas. High-signal edits (>= 0.5) are promoted to exemplars.
 *
 * Scoring rationale:
 *   factual_correction — highest value: corrects wrong facts
 *   omission / addition — medium: informative when substantial
 *   rephrase — low-medium: style signal but not factual
 *   formatting — lowest: rarely informative for future drafts
 *
 * @param classification - LLM-assigned edit class
 * @param stats - Word-level diff statistics
 * @returns Signal score in [0, 1]
 * @author Al Amin Ahamed
 */
export function computeSignalScore(
  classification: EditClassification,
  stats: DiffStats,
): number {
  const cls: EditClass = classification.class;
  switch (cls) {
    case "factual_correction":
      return 0.9;
    case "omission":
      return stats.wordsRemoved > 5 ? 0.7 : 0.4;
    case "addition":
      return stats.wordsAdded > 5 ? 0.7 : 0.4;
    case "rephrase":
      return 0.5;
    case "formatting":
      return 0.2;
  }
}

interface ExemplarRow {
  editId: string;
  section: string;
  originalText: string;
  editedText: string;
  editClass: string;
  signalScore: number;
}

/**
 * Embeds the original text of a high-signal edit and inserts a row into
 * edit_exemplars so future drafts can retrieve it as a few-shot example.
 * Called only when signalScore >= 0.5.
 *
 * @param row - Edit metadata needed for the exemplar record
 * @throws {Error} On embedding or database failure (caller handles gracefully)
 * @author Al Amin Ahamed
 */
export async function promoteToExemplar(row: ExemplarRow): Promise<void> {
  const [embedding] = await embedTexts([row.originalText]);
  if (!embedding) throw new Error("Embedding returned no result for exemplar");

  const embStr = `[${embedding.join(",")}]`;

  await sql`
    INSERT INTO edit_exemplars
      (section, before_text, after_text, edit_class, embedding, signal_score)
    VALUES (
      ${row.section},
      ${row.originalText},
      ${row.editedText},
      ${row.editClass},
      ${embStr}::vector,
      ${row.signalScore}
    )
  `;

  logger.info(
    { section: row.section, editId: row.editId, signalScore: row.signalScore },
    "edit promoted to exemplar",
  );
}
