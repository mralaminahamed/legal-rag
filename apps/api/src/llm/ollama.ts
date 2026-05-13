import OpenAI from "openai";
import type { ZodSchema } from "zod";
import { loadEnv } from "../lib/env.js";
import { logger } from "../lib/logger.js";
import type { CompletionOpts, LLMProvider } from "./provider.js";
import { extractJsonFromText } from "./utils.js";

/**
 * LLMProvider implementation backed by Ollama via its OpenAI-compatible
 * endpoint. Uses the openai SDK pointed at env.OLLAMA_BASE_URL with a
 * placeholder API key ("ollama") that the server ignores.
 *
 * Default temperature is 0.3 — slightly higher than cloud providers to
 * compensate for smaller-model determinism quirks.
 *
 * @author Al Amin Ahamed
 */
export class OllamaProvider implements LLMProvider {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor() {
    const env = loadEnv();
    this.baseUrl = env.OLLAMA_BASE_URL;
    this.model = env.OLLAMA_CHAT_MODEL;
    this.client = new OpenAI({
      baseURL: this.baseUrl,
      apiKey: "ollama",
    });
  }

  name(): "ollama" {
    return "ollama";
  }

  /**
   * Single-pass chat completion via Ollama's OpenAI-compatible endpoint.
   *
   * @param opts - System prompt, message history, and generation parameters
   * @returns Generated text content
   * @throws {Error} On connection failure or empty response
   * @author Al Amin Ahamed
   */
  async complete(opts: CompletionOpts): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: opts.maxTokens ?? 400,
      temperature: opts.temperature ?? 0.3,
      messages: [
        { role: "system", content: opts.system },
        ...opts.messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("Ollama response contained no content");
    return content;
  }

  /**
   * Attempts json_object response format (supported by newer Ollama builds).
   * Falls back to plain completion + extractJsonFromText on format errors.
   * Retries once with a corrective prompt on schema mismatch.
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
                    "Return ONLY a valid JSON object. No markdown, no code fences, no explanation.",
                },
              ],
            };

      try {
        let content: string;
        try {
          const response = await this.client.chat.completions.create({
            model: this.model,
            max_tokens: attemptOpts.maxTokens ?? 400,
            temperature: attemptOpts.temperature ?? 0.3,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: attemptOpts.system },
              ...attemptOpts.messages.map((m) => ({ role: m.role, content: m.content })),
            ],
          });
          content = response.choices[0]?.message?.content ?? "";
        } catch {
          // json_object mode unsupported by this model/version — fall back
          content = await this.complete(attemptOpts);
        }

        lastText = content;
        const result = schema.safeParse(JSON.parse(extractJsonFromText(content)));
        if (result.success) return result.data;
        logger.warn({ attempt, issues: result.error.issues }, "Ollama JSON schema mismatch");
      } catch (err) {
        logger.warn({ attempt, err }, "Ollama JSON parse error");
      }
    }

    throw new Error("Ollama failed to produce valid JSON after 2 attempts");
  }

  /**
   * Pings the Ollama API tags endpoint to verify the configured model is
   * pulled on the host. Logs a warning with pull instructions if not found.
   *
   * @returns true if the model is available, false otherwise
   * @author Al Amin Ahamed
   */
  async ping(): Promise<boolean> {
    try {
      const tagsUrl = this.baseUrl.replace(/\/v1\/?$/, "") + "/api/tags";
      const res = await fetch(tagsUrl, {
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) {
        logger.warn({ status: res.status, tagsUrl }, "Ollama /api/tags returned non-200");
        return false;
      }

      const data = await res.json() as { models?: Array<{ name: string }> };
      const available = (data.models ?? []).map((m) => m.name);
      const baseName = this.model.split(":")[0] ?? this.model;
      const found = available.some((n) => n.startsWith(baseName));

      if (!found) {
        logger.warn(
          { model: this.model, available },
          `Ollama model not found — run: ollama pull ${this.model}`,
        );
      }
      return found;
    } catch (err) {
      logger.warn({ err }, "Ollama ping failed — is `ollama serve` running?");
      return false;
    }
  }
}
