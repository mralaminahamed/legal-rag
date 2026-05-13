import { Hono } from "hono";
import { z } from "zod";
import { logger } from "../lib/logger.js";
import { SECTION_QUERIES } from "../lib/section-queries.js";
import { retrieveForSection } from "../pipeline/retrieve.js";

const BodySchema = z.object({
  document_id: z.string().uuid(),
  section: z.enum([
    "parties",
    "key_dates",
    "issues",
    "procedural_history",
    "relief",
  ]),
});

export const retrieveRouter = new Hono();

/**
 * POST /retrieve
 * Runs hybrid retrieval (vector + full-text, merged via RRF) for the given
 * document and case summary section.
 *
 * @returns 200 { section, chunks: RetrievedChunk[] }
 * @returns 400 On invalid/missing body fields
 * @returns 500 On retrieval failure
 * @author Al Amin Ahamed
 */
retrieveRouter.post("/", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Request body must be JSON" }, 400);
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Validation failed", issues: parsed.error.issues }, 400);
  }

  const { document_id, section } = parsed.data;
  const queries = SECTION_QUERIES[section];

  logger.info({ document_id, section }, "retrieval requested");

  try {
    const chunks = await retrieveForSection(document_id, queries);

    logger.info({ document_id, section, count: chunks.length }, "retrieval complete");

    return c.json({ section, chunks });
  } catch (err) {
    logger.error({ err, document_id, section }, "retrieval failed");
    const message = err instanceof Error ? err.message : "Internal error";
    return c.json({ error: message }, 500);
  }
});
