import type { ZodSchema } from "zod";

/**
 * A single chat turn. System prompt is separate (in CompletionOpts).
 * @author Al Amin Ahamed
 */
export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface CompletionOpts {
  system: string;
  messages: Message[];
  maxTokens?: number;
  temperature?: number;
}

/**
 * Uniform chat-completion interface across Anthropic, OpenAI, and Ollama.
 * Embeddings are NOT part of this interface — they are pinned to OpenAI in
 * apps/api/src/pipeline/embed.ts and never routed through here.
 *
 * @author Al Amin Ahamed
 */
export interface LLMProvider {
  /** Free-form text completion. */
  complete(opts: CompletionOpts): Promise<string>;

  /**
   * Completion that parses and validates the response against a Zod schema.
   * Retries once with a corrective prompt on parse or validation failure.
   */
  completeJSON<T>(opts: CompletionOpts, schema: ZodSchema<T>): Promise<T>;

  /** Returns the provider identifier used by the router and logs. */
  name(): "anthropic" | "openai" | "ollama";

  /**
   * Optional startup health check. Implemented by OllamaProvider to confirm
   * the model is pulled. Cloud providers omit this.
   */
  ping?(): Promise<boolean>;
}
