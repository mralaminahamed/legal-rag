import { Hono } from "hono";
import { z } from "zod";
import { sql } from "../db/client.js";
import { logger } from "../lib/logger.js";
import { computeDiff } from "../edit-loop/diff.js";
import { classifyEdit } from "../edit-loop/classify.js";
import { computeSignalScore, promoteToExemplar } from "../edit-loop/exemplars.js";
import { updateStylePreferences } from "../edit-loop/preferences.js";
import type { DraftCitation } from "../types.js";

const EditBodySchema = z.object({
  draft_id: z.string().uuid(),
  section: z.enum([
    "parties",
    "key_dates",
    "issues",
    "procedural_history",
    "relief",
  ]),
  edited_text: z.string().min(1),
});

export const editRouter = new Hono();

/**
 * POST /edit
 * Captures an operator edit to a draft section, classifies it, stores the
 * edit record, and conditionally promotes it to the exemplar pool.
 * Triggers style preference re-summarisation (debounced to every 3 edits).
 *
 * @returns 200 { editId, classification, signalScore, promotedToExemplar }
 * @returns 400 On invalid body or missing draft
 * @returns 500 On pipeline failure
 * @author Al Amin Ahamed
 */
editRouter.post("/", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Request body must be JSON" }, 400);
  }

  const parsed = EditBodySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Validation failed", issues: parsed.error.issues }, 400);
  }

  const { draft_id, section, edited_text } = parsed.data;

  // Fetch original draft content
  const draftRows = await sql<Array<{ content: string; citations: DraftCitation[] }>>`
    SELECT content, citations FROM drafts WHERE id = ${draft_id} AND section = ${section} LIMIT 1
  `;
  const draft = draftRows[0];
  if (!draft) {
    return c.json({ error: `Draft ${draft_id} section ${section} not found` }, 404);
  }

  const original = draft.content;

  // Compute diff
  const { ops, stats } = computeDiff(original, edited_text);

  // Classify
  const classification = await classifyEdit(original, edited_text, ops, stats);

  // Signal score
  const signalScore = computeSignalScore(classification, stats);

  // INSERT edit row (always persisted, even if exemplar promotion fails)
  const editRows = await sql<Array<{ id: string }>>`
    INSERT INTO edits
      (draft_id, section, original_text, edited_text, diff_ops, edit_class)
    VALUES (
      ${draft_id},
      ${section},
      ${original},
      ${edited_text},
      ${sql.json(ops)},
      ${classification.class}
    )
    RETURNING id
  `;
  const editId = editRows[0]?.id;
  if (!editId) {
    return c.json({ error: "Edit INSERT returned no row" }, 500);
  }

  logger.info(
    { editId, section, class: classification.class, signalScore },
    "edit recorded",
  );

  // Conditionally promote to exemplar
  let promotedToExemplar = false;
  if (signalScore >= 0.5) {
    try {
      await promoteToExemplar({
        editId,
        section,
        originalText: original,
        editedText: edited_text,
        editClass: classification.class,
        signalScore,
      });
      promotedToExemplar = true;
    } catch (err) {
      logger.error({ err, editId }, "exemplar promotion failed — edit still persisted");
    }
  }

  // Update style preferences (debounced)
  updateStylePreferences(section).catch((err: unknown) => {
    logger.error({ err, section }, "style preference update failed");
  });

  return c.json({ editId, classification, signalScore, promotedToExemplar });
});
