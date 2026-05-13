import OpenAI from "openai";
import type { ZodSchema } from "zod";
import { loadEnv } from "../lib/env.js";
import { logger } from "../lib/logger.js";
import type { CompletionOpts, LLMProvider } from "./provider.js";
import { extractJsonFromText } from "./utils.js";

/**
 * LLMProvider implementation backed by OpenAI Chat Completions.
 * Uses response_format json_object for completeJSON to avoid parse errors.
 * Model is read from env.OPENAI_MODEL; default gpt-4o-mini.
 *
 * @author Al Amin Ahamed
 */
export class OpenAIProvider implements LLMProvider {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor() {
    const env = loadEnv();
    if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set");
    this.client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    this.model = env.OPENAI_MODEL;
  }

  name(): "openai" {
    return "openai";
  }

  /**
   * Single-pass chat completion via OpenAI Chat API.
   *
   * @param opts - System prompt, message history, and generation parameters
   * @returns Generated text content
   * @throws {Error} On API error or empty response
   * @author Al Amin Ahamed
   */
  async complete(opts: CompletionOpts): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: opts.maxTokens ?? 400,
      temperature: opts.temperature ?? 0.2,
      messages: [
        { role: "system", content: opts.system },
        ...opts.messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("OpenAI response contained no content");
    return content;
  }

  /**
   * Completes with json_object response format and validates against Zod schema.
   * Retries once without json_object mode on schema mismatch.
   *
   * @param opts - Completion options
   * @param schema - Zod schema to validate against
   * @returns Validated, typed JSON response
   * @throws {Error} After 2 failed attempts
   * @author Al Amin Ahamed
   */
  async completeJSON<T>(opts: CompletionOpts, schema: ZodSchema<T>): Promise<T> {
    let lastText = "";

    for (let attempt = 0; attempt < 2; attempt++) {
      const attemptOpts: CompletionOpts =
        attempt === 0
          ? opts
          : {
              ...opts,
              messages: [
                ...opts.messages,
                { role: "assistant", content: lastText },
                {
                  role: "user",
                  content: "Return ONLY a valid JSON object matching the required schema.",
                },
              ],
            };

      try {
        const response = await this.client.chat.completions.create({
          model: this.model,
          max_tokens: attemptOpts.maxTokens ?? 400,
          temperature: attemptOpts.temperature ?? 0.2,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: attemptOpts.system },
            ...attemptOpts.messages.map((m) => ({ role: m.role, content: m.content })),
          ],
        });

        lastText = response.choices[0]?.message?.content ?? "";
        const result = schema.safeParse(JSON.parse(extractJsonFromText(lastText)));
        if (result.success) return result.data;
        logger.warn({ attempt, issues: result.error.issues }, "OpenAI JSON schema mismatch");
      } catch (err) {
        logger.warn({ attempt, err }, "OpenAI JSON parse error");
      }
    }

    throw new Error("OpenAI failed to produce valid JSON after 2 attempts");
  }
}
