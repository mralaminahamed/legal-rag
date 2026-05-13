import { sql } from "../db/client.js";
import { extractDocument } from "../lib/ocr-client.js";
import { logger } from "../lib/logger.js";
import { extractStructuredFields } from "./extract-fields.js";
import { chunkDocument } from "./chunk.js";
import { embedTexts } from "./embed.js";
import type { IngestResult } from "../types.js";

/**
 * Full ingestion pipeline:
 *   OCR → structured field extraction → document INSERT →
 *   semantic chunking → embedding → chunk INSERTs.
 *
 * @param buffer - Raw file bytes (PDF or image)
 * @param filename - Original filename forwarded to the OCR sidecar
 * @returns IngestResult with documentId, chunkCount, extracted fields, and OCR confidence
 * @throws {Error} On OCR failure or database write failure
 * @author Al Amin Ahamed
 */
export async function ingestDocument(
  buffer: Buffer,
  filename: string,
): Promise<IngestResult> {
  // ── 1. OCR ──────────────────────────────────────────────────────────────
  logger.info({ filename }, "starting OCR");
  const ocr = await extractDocument(buffer, filename);
  logger.info(
    { strategy: ocr.strategy_used, confidence: ocr.overall_confidence, pages: ocr.pages.length },
    "OCR complete",
  );

  // ── 2. Structured field extraction ─────────────────────────────────────
  logger.info("extracting structured fields via Claude");
  const fields = await extractStructuredFields(ocr.text);
  logger.info(
    { document_type: fields.document_type, parties: fields.parties, dates: fields.key_dates.length },
    "field extraction complete",
  );

  // ── 3. Persist document ─────────────────────────────────────────────────
  const docRows = await sql<Array<{ id: string }>>`
    INSERT INTO documents
      (filename, document_type, parties, key_dates, raw_text, ocr_confidence)
    VALUES (
      ${filename},
      ${fields.document_type},
      ${JSON.stringify(fields.parties)}::jsonb,
      ${JSON.stringify(fields.key_dates)}::jsonb,
      ${ocr.text},
      ${ocr.overall_confidence}
    )
    RETURNING id
  `;

  const docRow = docRows[0];
  if (!docRow) throw new Error("INSERT into documents returned no rows");
  const documentId = docRow.id;
  logger.info({ documentId }, "document persisted");

  // ── 4. Semantic chunking ─────────────────────────────────────────────────
  logger.info("chunking document");
  const chunks = await chunkDocument(ocr.text);
  logger.info({ chunkCount: chunks.length }, "chunking complete");

  if (chunks.length === 0) {
    logger.warn({ documentId }, "no chunks produced — document may be empty");
    return { documentId, chunkCount: 0, fields, ocrConfidence: ocr.overall_confidence, ocrStrategy: ocr.strategy_used };
  }

  // ── 5. Embed all chunks ──────────────────────────────────────────────────
  logger.info({ chunkCount: chunks.length }, "embedding chunks");
  const chunkTexts = chunks.map((c) => c.text);
  const embeddings = await embedTexts(chunkTexts);
  logger.info("embedding complete");

  // ── 6. Persist chunks ────────────────────────────────────────────────────
  await sql.begin(async (txSql) => {
    for (const [idx, chunk] of chunks.entries()) {
      const embedding = embeddings[idx];
      if (!embedding) {
        throw new Error(`Missing embedding for chunk index ${idx}`);
      }
      const embStr = `[${embedding.join(",")}]`;

      await txSql`
        INSERT INTO chunks
          (document_id, chunk_index, text, page_number, embedding)
        VALUES (
          ${documentId},
          ${idx},
          ${chunk.text},
          ${null},
          ${embStr}::vector
        )
      `;
    }
  });

  logger.info({ documentId, chunkCount: chunks.length }, "ingestion complete");

  return {
    documentId,
    chunkCount: chunks.length,
    fields,
    ocrConfidence: ocr.overall_confidence,
    ocrStrategy: ocr.strategy_used,
  };
}
