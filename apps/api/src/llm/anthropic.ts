import Anthropic from "@anthropic-ai/sdk";
import type { ZodSchema } from "zod";
import { loadEnv } from "../lib/env.js";
import { logger } from "../lib/logger.js";
import type { CompletionOpts, LLMProvider, Message } from "./provider.js";
import { extractJsonFromText } from "./utils.js";

/**
 * LLMProvider implementation backed by Anthropic Claude.
 * Model is read from env.ANTHROPIC_MODEL; default claude-sonnet-4-6.
 * Temperature default: 0.2 (deterministic enough for grounded legal drafts).
 *
 * @author Al Amin Ahamed
 */
export class AnthropicProvider implements LLMProvider {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor() {
    const env = loadEnv();
    if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set");
    this.client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    this.model = env.ANTHROPIC_MODEL;
  }

  name(): "anthropic" {
    return "anthropic";
  }

  /**
   * Single-pass chat completion via Claude Messages API.
   *
   * @param opts - System prompt, message history, and generation parameters
   * @returns Generated text content
   * @throws {Error} On API error or missing content block
   * @author Al Amin Ahamed
   */
  async complete(opts: CompletionOpts): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: opts.maxTokens ?? 400,
      temperature: opts.temperature ?? 0.2,
      system: opts.system,
      messages: opts.messages.map((m: Message) => ({
        role: m.role,
        content: m.content,
      })),
    });

    const block = response.content[0];
    if (!block || block.type !== "text") {
      throw new Error("Anthropic response contained no text block");
    }
    return block.text;
  }

  /**
   * Completes and validates against a Zod schema. Retries once with a
   * corrective prompt if JSON parse or schema validation fails.
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
                  content:
                    "Your response was not valid JSON matching the required schema. " +
                    "Return ONLY the JSON object with no markdown, no code fences, no explanation.",
                },
              ],
            };

      try {
        lastText = await this.complete(attemptOpts);
        const result = schema.safeParse(JSON.parse(extractJsonFromText(lastText)));
        if (result.success) return result.data;
        logger.warn({ attempt, issues: result.error.issues }, "Anthropic JSON schema mismatch");
      } catch (err) {
        logger.warn({ attempt, err }, "Anthropic JSON parse error");
      }
    }

    throw new Error("Anthropic failed to produce valid JSON after 2 attempts");
  }
}
