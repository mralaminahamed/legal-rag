import { z } from "zod";
import { loadEnv } from "../lib/env.js";
import { logger } from "../lib/logger.js";
import { getLLMProvider } from "../llm/router.js";
import {
  EXTRACT_FIELDS_SYSTEM,
  buildExtractUserMessage,
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
      // Accept both strict ISO and relaxed strings; downstream can normalise
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
 * Extracts structured fields (parties, key dates, document type) from raw OCR
 * text using the configured LLM provider (respects LLM_PROVIDER env).
 *
 * Previously hard-coded to Anthropic; now routes through getLLMProvider() so
 * OpenAI and Ollama paths work without an Anthropic key.
 *
 * Adds debug-level logging of input length, text preview, and extraction
 * result so failures are visible in logs rather than silently defaulting.
 *
 * @param rawText - Full document text from the OCR sidecar
 * @returns Parsed DocumentFields, or empty fields if extraction fails
 * @author Al Amin Ahamed
 */
export async function extractStructuredFields(
  rawText: string,
): Promise<DocumentFields> {
  const env = loadEnv();
  void env; // accessed only for side-effect of early validation

  logger.debug(
    { textLength: rawText.length, preview: rawText.slice(0, 500) },
    "extractStructuredFields: input",
  );

  const provider = getLLMProvider();
  logger.debug({ provider: provider.name() }, "extractStructuredFields: using provider");

  try {
    const fields = await provider.completeJSON(
      {
        system: EXTRACT_FIELDS_SYSTEM,
        messages: [{ role: "user", content: buildExtractUserMessage(rawText) }],
        maxTokens: 1024,
        temperature: 0.1,
      },
      DocumentFieldsSchema,
    );

    logger.info(
      {
        document_type: fields.document_type,
        plaintiffs: fields.parties.plaintiffs.length,
        defendants: fields.parties.defendants.length,
        counsel: fields.parties.counsel.length,
        key_dates: fields.key_dates.length,
      },
      "extractStructuredFields: complete",
    );

    return fields;
  } catch (err) {
    logger.error(
      { err, provider: provider.name(), textLength: rawText.length },
      "extractStructuredFields: failed — returning empty fields",
    );
    return emptyFields();
  }
}
