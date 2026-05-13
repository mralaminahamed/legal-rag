import { Hono } from "hono";
import { z } from "zod";
import { sql } from "../db/client.js";
import { logger } from "../lib/logger.js";
import { generateDraft } from "../pipeline/generate.js";
import type { DraftCitation } from "../types.js";

export const draftRouter = new Hono();

const PostBodySchema = z.object({
  document_id: z.string().uuid(),
});

/**
 * POST /draft
 * Triggers five-section Case Fact Summary generation for a document.
 *
 * @returns 200 DraftResult with sections, citations, and grounding scores
 * @returns 400 On invalid/missing document_id
 * @returns 500 On pipeline failure
 * @author Al Amin Ahamed
 */
draftRouter.post("/", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Request body must be JSON" }, 400);
  }

  const parsed = PostBodySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Validation failed", issues: parsed.error.issues }, 400);
  }

  const { document_id } = parsed.data;

  logger.info({ document_id }, "draft generation requested");

  try {
    const result = await generateDraft(document_id);
    return c.json(result);
  } catch (err) {
    logger.error({ err, document_id }, "draft generation failed");
    const message = err instanceof Error ? err.message : "Internal error";
    return c.json({ error: message }, 500);
  }
});

/**
 * GET /draft/:id
 * Fetches a previously generated draft row by its UUID.
 *
 * @returns 200 Draft row with content and citations JSONB
 * @returns 404 When draft does not exist
 * @author Al Amin Ahamed
 */
draftRouter.get("/:id", async (c) => {
  const id = c.req.param("id");

  const rows = await sql<
    Array<{
      id: string;
      document_id: string;
      section: string;
      content: string;
      citations: DraftCitation[];
      iteration: number;
      generated_at: string;
    }>
  >`
    SELECT id, document_id, section, content, citations, iteration, generated_at
    FROM drafts
    WHERE id = ${id}
    LIMIT 1
  `;

  const draft = rows[0];
  if (!draft) {
    return c.json({ error: `Draft ${id} not found` }, 404);
  }

  return c.json(draft);
});

/**
 * GET /draft/:draftId/citations
 * Returns the citation evidence that backed a stored draft section.
 * Enables reviewers to inspect which source chunks were cited.
 *
 * @returns 200 { draft_id, document_id, section, iteration, citations }
 * @returns 404 When draft does not exist
 * @author Al Amin Ahamed
 */
draftRouter.get("/:draftId/citations", async (c) => {
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

  if (rows === null) return c.json({ error: "Database error" }, 500);

  const draft = rows[0];
  if (!draft) return c.json({ error: `Draft ${draftId} not found` }, 404);

  return c.json({
    draft_id: draft.id,
    document_id: draft.document_id,
    section: draft.section,
    iteration: draft.iteration,
    citations: draft.citations,
  });
});
