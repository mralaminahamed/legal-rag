import { Hono } from "hono";
import { sql } from "../db/client.js";
import { logger } from "../lib/logger.js";

export const documentsRouter = new Hono();

/**
 * GET /documents
 * Returns a list of all ingested documents ordered by creation time (newest first).
 * Used by the UI sidebar to populate the document picker.
 *
 * @returns 200 Array of { id, filename, document_type, created_at }
 * @throws {Error} On database query failure
 * @author Al Amin Ahamed
 */
documentsRouter.get("/", async (c) => {
  try {
    const rows = await sql<
      Array<{ id: string; filename: string; document_type: string | null; created_at: string }>
    >`
      SELECT id, filename, document_type, created_at
      FROM documents
      ORDER BY created_at DESC
      LIMIT 100
    `;
    return c.json(rows);
  } catch (err) {
    logger.error({ err }, "failed to list documents");
    return c.json({ error: "Database error" }, 500);
  }
});

/**
 * GET /documents/:id
 * Returns a single document's metadata and structured fields.
 *
 * @returns 200 Full document row including parties and key_dates
 * @returns 404 When document does not exist
 * @throws {Error} On database query failure
 * @author Al Amin Ahamed
 */
documentsRouter.get("/:id", async (c) => {
  const id = c.req.param("id");
  try {
    const rows = await sql<
      Array<{
        id: string;
        filename: string;
        document_type: string | null;
        parties: unknown;
        key_dates: unknown;
        ocr_confidence: number;
        created_at: string;
      }>
    >`
      SELECT id, filename, document_type, parties, key_dates, ocr_confidence, created_at
      FROM documents
      WHERE id = ${id}
      LIMIT 1
    `;
    const doc = rows[0];
    if (!doc) return c.json({ error: `Document ${id} not found` }, 404);
    return c.json(doc);
  } catch (err) {
    logger.error({ err, id }, "failed to fetch document");
    return c.json({ error: "Database error" }, 500);
  }
});

/**
 * GET /documents/:id/drafts
 * Returns all draft sections for a document (latest per section).
 *
 * @returns 200 Array of draft sections with content, citations, groundingScore
 * @returns 404 When no drafts exist for this document
 * @author Al Amin Ahamed
 */
documentsRouter.get("/:id/drafts", async (c) => {
  const documentId = c.req.param("id");
  try {
    const rows = await sql<
      Array<{
        id: string;
        section: string;
        content: string;
        citations: unknown;
        iteration: number;
        generated_at: string;
      }>
    >`
      SELECT DISTINCT ON (section) id, section, content, citations, iteration, generated_at
      FROM drafts
      WHERE document_id = ${documentId}
      ORDER BY section, generated_at DESC
    `;
    return c.json({ documentId, sections: rows });
  } catch (err) {
    logger.error({ err, documentId }, "failed to fetch drafts");
    return c.json({ error: "Database error" }, 500);
  }
});
