/**
 * Deterministic mock LLM provider for unit tests.
 *
 * Usage:
 *   const mock = buildMockProvider({ factual: '{"class":"factual_correction","confidence":0.9,"reasoning":"test"}' });
 *   // inject via vi.mock or pass directly to the function under test
 *
 * @author Al Amin Ahamed
 */

import type { ZodSchema } from "zod";
import type { CompletionOpts, LLMProvider } from "../llm/provider.js";

export interface MockCall {
  opts: CompletionOpts;
  schemaUsed: boolean;
}

class MockLLMProvider implements LLMProvider {
  /** Every complete/completeJSON call is recorded here for assertion. */
  readonly calls: MockCall[] = [];

  /**
   * Map from a substring of the user message to the canned response string.
   * First key whose substring appears in the user message wins.
   * Falls back to "_default" if no key matches.
   */
  private readonly responses: Record<string, string>;

  constructor(responses: Record<string, string> = {}) {
    this.responses = responses;
  }

  name(): "anthropic" | "openai" | "ollama" {
    return "openai";
  }

  async complete(opts: CompletionOpts): Promise<string> {
    this.calls.push({ opts, schemaUsed: false });
    return this._resolve(opts);
  }

  async completeJSON<T>(opts: CompletionOpts, schema: ZodSchema<T>): Promise<T> {
    this.calls.push({ opts, schemaUsed: true });
    const raw = this._resolve(opts);
    return schema.parse(JSON.parse(raw));
  }

  private _resolve(opts: CompletionOpts): string {
    const userContent = opts.messages.map((m) => m.content).join(" ");
    for (const [key, value] of Object.entries(this.responses)) {
      if (key !== "_default" && userContent.includes(key)) return value;
    }
    const fallback = this.responses["_default"];
    if (fallback !== undefined) return fallback;
    throw new Error(
      `MockLLMProvider: no response configured for prompt. ` +
      `User content preview: "${userContent.slice(0, 100)}". ` +
      `Configured keys: [${Object.keys(this.responses).join(", ")}]`,
    );
  }
}

/**
 * Factory for creating a MockLLMProvider with canned responses.
 *
 * @param responses - Map of user-message substring → JSON response string.
 *   Use "_default" as a catch-all key.
 * @returns MockLLMProvider instance with inspectable `calls` array
 * @throws {never}
 * @author Al Amin Ahamed
 */
export function buildMockProvider(
  responses: Record<string, string> = {},
): MockLLMProvider {
  return new MockLLMProvider(responses);
}
