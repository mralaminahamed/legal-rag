import { z } from "zod";

const envSchema = z.object({
  // ── LLM provider selection ──────────────────────────────────────────────
  LLM_PROVIDER: z.enum(["anthropic", "openai", "ollama"]).default("anthropic"),

  // ── Chat provider credentials (conditionally required) ──────────────────
  // Validated at startup by validateProviderConfig; optional here so Zod
  // does not reject a valid Ollama config that has no chat API keys.
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),

  // ── Chat model names ────────────────────────────────────────────────────
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-4-6"),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),

  // ── Ollama ──────────────────────────────────────────────────────────────
  OLLAMA_BASE_URL: z
    .string()
    .url()
    .default("http://host.docker.internal:11434/v1"),
  OLLAMA_CHAT_MODEL: z
    .string()
    .default("qwen2.5:14b-instruct-q5_K_M"),

  // ── Embeddings (always OpenAI, locked at 1536 dims) ─────────────────────
  OPENAI_EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),

  // ── Infrastructure ──────────────────────────────────────────────────────
  DATABASE_URL: z.string().url(),
  OCR_SERVICE_URL: z.string().url(),
  PORT_API: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),
});

export type Env = z.infer<typeof envSchema>;

let _cached: Env | null = null;

/**
 * Parses and validates all environment variables via Zod. Result is cached
 * so subsequent calls within a process pay no re-validation cost.
 *
 * @returns Validated, typed environment configuration object
 * @throws {Error} When required env vars are absent or invalid
 * @author Al Amin Ahamed
 */
export function loadEnv(): Env {
  if (_cached) return _cached;

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const formatted = result.error.issues
      .map((e) => `  ${e.path.join(".")}: ${e.message}`)
      .join("\n");
    throw new Error(`Environment validation failed:\n${formatted}`);
  }

  _cached = result.data;
  return _cached;
}

/**
 * Validates that the selected LLM_PROVIDER has its required credential.
 * Called at API startup so the process fails fast with a legible message
 * rather than surfacing a 401 on the first request.
 *
 * Ollama requires no API key. Anthropic and OpenAI each require their
 * respective key. OpenAI key is additionally required for embeddings
 * regardless of LLM_PROVIDER.
 *
 * @param env - Validated Env object from loadEnv()
 * @throws {Error} When a required credential is missing for the chosen provider
 * @author Al Amin Ahamed
 */
export function validateProviderConfig(env: Env): void {
  if (env.LLM_PROVIDER === "anthropic" && !env.ANTHROPIC_API_KEY) {
    throw new Error(
      "LLM_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set. " +
        "Set the key or switch to LLM_PROVIDER=ollama for keyless local use.",
    );
  }

  if (env.LLM_PROVIDER === "openai" && !env.OPENAI_API_KEY) {
    throw new Error(
      "LLM_PROVIDER=openai but OPENAI_API_KEY is not set.",
    );
  }

  // Embeddings always go to OpenAI regardless of LLM_PROVIDER
  if (!env.OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY is required for embeddings regardless of LLM_PROVIDER. " +
        "Set the key or the ingestion pipeline will fail at the embedding step.",
    );
  }
}
