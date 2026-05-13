import { Hono } from "hono";
import { sql } from "../db/client.js";
import { logger } from "../lib/logger.js";
import type { DraftCitation } from "../types.js";

export const draftCitationsRouter = new Hono();

/**
 * GET /draft/:draftId/citations
 * Returns the citations (evidence chunks) that backed a stored draft section.
 * Each citation includes chunk_id, snippet, and score from retrieval.
 * Enables reviewers to inspect the grounding evidence for any generated section.
 *
 * @returns 200 { draft_id, document_id, section, iteration, citations }
 * @returns 404 When the draft does not exist
 * @returns 500 On database error
 * @author Al Amin Ahamed
 */
draftCitationsRouter.get("/:draftId/citations", async (c) => {
  const draftId = c.req.param("draftId");

  const rows = await sql<
    Array<{
      id: string;
      document_id: string;
      section: string;
      iteration: number;
      citations: DraftCitation[];
    }>
  >`
    SELECT id, document_id, section, iteration, citations
    FROM drafts
    WHERE id = ${draftId}
    LIMIT 1
  `.catch((err: unknown) => {
    logger.error({ err, draftId }, "citations query failed");
    return null;
  });

  if (rows === null) {
    return c.json({ error: "Database error" }, 500);
  }

  const draft = rows[0];
  if (!draft) {
    return c.json({ error: `Draft ${draftId} not found` }, 404);
  }

  return c.json({
    draft_id: draft.id,
    document_id: draft.document_id,
    section: draft.section,
    iteration: draft.iteration,
    citations: draft.citations,
  });
});
