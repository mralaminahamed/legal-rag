import { loadEnv } from "../lib/env.js";
import { logger } from "../lib/logger.js";
import { AnthropicProvider } from "./anthropic.js";
import { OllamaProvider } from "./ollama.js";
import { OpenAIProvider } from "./openai.js";
import type { LLMProvider } from "./provider.js";

type ProviderName = "anthropic" | "openai" | "ollama";

/** Singleton instances — one per provider, created lazily. */
const _instances: Partial<Record<ProviderName, LLMProvider>> = {};

function tryCreate(name: ProviderName): LLMProvider | null {
  const env = loadEnv();
  try {
    switch (name) {
      case "anthropic":
        return env.ANTHROPIC_API_KEY ? new AnthropicProvider() : null;
      case "openai":
        return env.OPENAI_API_KEY ? new OpenAIProvider() : null;
      case "ollama":
        return new OllamaProvider();
    }
  } catch (err) {
    logger.error({ err, provider: name }, "provider instantiation failed");
    return null;
  }
}

/**
 * Returns a singleton LLMProvider for the requested name (or env.LLM_PROVIDER).
 * Falls back through anthropic → openai → ollama when the primary provider
 * cannot be instantiated due to missing credentials. Logs the fallback decision.
 *
 * @param override - Force a specific provider, bypassing env.LLM_PROVIDER
 * @returns Ready-to-use LLMProvider instance
 * @throws {Error} When no provider can be instantiated
 * @author Al Amin Ahamed
 */
export function getLLMProvider(override?: ProviderName): LLMProvider {
  const env = loadEnv();
  const requested = override ?? env.LLM_PROVIDER;

  const FALLBACK: ProviderName[] = ["anthropic", "openai", "ollama"];
  const order: ProviderName[] = [
    requested,
    ...FALLBACK.filter((p) => p !== requested),
  ];

  for (const name of order) {
    if (!_instances[name]) {
      const p = tryCreate(name);
      if (p) _instances[name] = p;
    }

    const p = _instances[name];
    if (p) {
      if (name !== requested) {
        logger.warn({ requested, using: name }, "LLM provider fallback");
      }
      return p;
    }
  }

  throw new Error(
    "No LLM provider available — set ANTHROPIC_API_KEY, OPENAI_API_KEY, or use LLM_PROVIDER=ollama",
  );
}
