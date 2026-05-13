import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { loadEnv } from "../lib/env.js";
import { logger } from "../lib/logger.js";
import {
  EXTRACT_FIELDS_SYSTEM,
  buildExtractUserMessage,
  buildRetryUserMessage,
} from "../lib/prompts/extract-fields-prompt.js";
import type { DocumentFields } from "../types.js";

const DocumentFieldsSchema = z.object({
  document_type: z.string().nullable(),
  parties: z.object({
    plaintiffs: z.array(z.string()),
    defendants: z.array(z.string()),
    counsel: z.array(z.string()),
  }),
  key_dates: z.array(
    z.object({
      label: z.string(),
      iso_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
  ),
});

function emptyFields(): DocumentFields {
  return {
    document_type: null,
    parties: { plaintiffs: [], defendants: [], counsel: [] },
    key_dates: [],
  };
}

/**
 * Strips markdown code fences from a Claude response so the remaining
 * string can be passed directly to JSON.parse.
 *
 * @param text - Raw text from Claude message
 * @returns Extracted JSON string
 * @author Al Amin Ahamed
 */
function extractJsonFromResponse(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch?.[1]) return fenceMatch[1].trim();
  const bracketMatch = text.match(/(\{[\s\S]*\})/);
  if (bracketMatch?.[1]) return bracketMatch[1].trim();
  return text.trim();
}

async function callClaude(
  client: Anthropic,
  model: string,
  userContent: string,
): Promise<string> {
  const message = await client.messages.create({
    model,
    max_tokens: 1024,
    system: EXTRACT_FIELDS_SYSTEM,
    messages: [{ role: "user", content: userContent }],
  });

  const block = message.content[0];
  if (!block || block.type !== "text") {
    throw new Error(`Unexpected Claude response content type: ${block?.type}`);
  }
  return block.text;
}

/**
 * Calls Anthropic Claude to extract structured fields (parties, dates,
 * document type) from raw OCR text. Validates the JSON response with Zod.
 * Retries once with a corrective prompt on parse failure.
 *
 * @param rawText - Full raw text from the OCR sidecar
 * @returns Parsed DocumentFields, or empty fields if both attempts fail
 * @author Al Amin Ahamed
 */
export async function extractStructuredFields(
  rawText: string,
): Promise<DocumentFields> {
  const env = loadEnv();
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  let responseText: string;

  try {
    responseText = await callClaude(
      client,
      env.ANTHROPIC_MODEL,
      buildExtractUserMessage(rawText),
    );
  } catch (err) {
    logger.error({ err }, "Claude field extraction call failed");
    return emptyFields();
  }

  const attempt = tryParse(responseText);
  if (attempt) return attempt;

  logger.warn("First parse failed — retrying with corrective prompt");

  try {
    responseText = await callClaude(
      client,
      env.ANTHROPIC_MODEL,
      buildRetryUserMessage(rawText),
    );
  } catch (err) {
    logger.error({ err }, "Retry Claude call failed");
    return emptyFields();
  }

  const retried = tryParse(responseText);
  if (retried) return retried;

  logger.error("Both field extraction attempts produced invalid JSON — returning empty fields");
  return emptyFields();
}

/**
 * Attempts to parse and validate a Claude response string as DocumentFields.
 *
 * @param text - Raw response text from Claude
 * @returns DocumentFields on success, null on parse or validation failure
 * @author Al Amin Ahamed
 */
function tryParse(text: string): DocumentFields | null {
  try {
    const jsonStr = extractJsonFromResponse(text);
    const raw: unknown = JSON.parse(jsonStr);
    const result = DocumentFieldsSchema.safeParse(raw);
    if (result.success) return result.data;
    logger.warn({ issues: result.error.issues }, "DocumentFields schema validation failed");
    return null;
  } catch {
    logger.warn("JSON.parse failed on Claude response");
    return null;
  }
}
