/**
 * Shared environment loader for all eval scripts.
 * Call loadEvalEnv() after importing "dotenv/config" in each script.
 *
 * @author Al Amin Ahamed
 */

import { z } from "zod";

const evalEnvSchema = z.object({
  DATABASE_URL: z
    .string()
    .default("postgres://legal:secret@localhost:5432/legalrag"),
  API_URL: z.string().url().default("http://localhost:3000"),
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
  LLM_PROVIDER: z
    .enum(["anthropic", "openai", "ollama"])
    .default("ollama"),
  CONFIRM_RESET: z
    .string()
    .optional()
    .transform((v) => v === "1"),
});

export type EvalEnv = z.infer<typeof evalEnvSchema>;

let _cached: EvalEnv | null = null;

/**
 * Parses and validates eval-script env vars via Zod. Cached after first call.
 * Caller must import "dotenv/config" before calling this function.
 *
 * @returns Validated eval environment configuration
 * @throws {Error} On invalid env var values
 * @author Al Amin Ahamed
 */
export function loadEvalEnv(): EvalEnv {
  if (_cached) return _cached;

  const cleaned = Object.fromEntries(
    Object.entries(process.env).map(([k, v]) => [k, v === "" ? undefined : v]),
  );

  const result = evalEnvSchema.safeParse(cleaned);
  if (!result.success) {
    const msg = result.error.issues
      .map((e) => `  ${e.path.join(".")}: ${e.message}`)
      .join("\n");
    throw new Error(`Eval env validation failed:\n${msg}`);
  }

  _cached = result.data;
  return _cached;
}
