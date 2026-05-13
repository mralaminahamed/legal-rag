import { z } from "zod";
import { getLLMProvider } from "../llm/router.js";
import { logger } from "../lib/logger.js";
import type { DiffOp, DiffStats, EditClassification } from "../types.js";

const ClassificationSchema = z.object({
  class: z.enum([
    "rephrase",
    "factual_correction",
    "formatting",
    "omission",
    "addition",
  ]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});

const SYSTEM = `You are classifying a legal document edit into exactly one category.

Categories:
- rephrase: Same meaning, different words. No factual change.
- factual_correction: A specific factual claim was changed (name, date, amount, case number, etc.)
- formatting: Change to capitalization, punctuation, numbering, or structure only — no semantic change.
- omission: Content was removed without replacement.
- addition: New content was added without removing existing content.

Return a JSON object:
{
  "class": "rephrase" | "factual_correction" | "formatting" | "omission" | "addition",
  "confidence": 0.0–1.0,
  "reasoning": "one sentence explaining the classification"
}`;

/**
 * Classifies an operator edit into one of five semantic categories using
 * an LLM call (provider chosen by env.LLM_PROVIDER). Validates the response
 * with Zod; falls back to "rephrase" with low confidence on failure.
 *
 * @param original - Section text before the operator's edit
 * @param edited - Section text after the operator's edit
 * @param diffOps - Structured diff operations from computeDiff
 * @param stats - Aggregate diff statistics for prompt context
 * @returns EditClassification with class, confidence, and reasoning
 * @throws {Error} When LLM provider call fails or response cannot be parsed as valid JSON
 * @author Al Amin Ahamed
 */
export async function classifyEdit(
  original: string,
  edited: string,
  diffOps: DiffOp[],
  stats: DiffStats,
): Promise<EditClassification> {
  const provider = getLLMProvider();

  const nonEqualOps = diffOps
    .filter((op) => op.kind !== "equal")
    .slice(0, 8)
    .map((op) => `[${op.kind}] "${op.originalText}" → "${op.editedText}"`)
    .join("\n");

  const user = `ORIGINAL TEXT:
${original.slice(0, 600)}

EDITED TEXT:
${edited.slice(0, 600)}

DIFF OPERATIONS (up to 8):
${nonEqualOps || "(no changes detected)"}

STATS: +${stats.wordsAdded} words added, -${stats.wordsRemoved} removed, ~${stats.wordsReplaced} replaced

Classify this edit.`;

  try {
    return await provider.completeJSON(
      { system: SYSTEM, messages: [{ role: "user", content: user }], maxTokens: 200, temperature: 0.1 },
      ClassificationSchema,
    );
  } catch (err) {
    logger.error({ err }, "edit classification failed — defaulting to rephrase");
    return { class: "rephrase", confidence: 0.3, reasoning: "classification call failed" };
  }
}
