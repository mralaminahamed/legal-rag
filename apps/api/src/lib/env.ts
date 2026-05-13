import { z } from "zod";

const envSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-4-6"),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  OPENAI_EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
  DATABASE_URL: z.string().url(),
  OCR_SERVICE_URL: z.string().url(),
  PORT_API: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),
});

/**
 * Parses and validates all required environment variables via Zod.
 * Throws at startup if any required variable is missing or malformed,
 * preventing silent runtime failures from misconfigured deployments.
 *
 * @returns Validated, typed environment configuration object
 * @throws {ZodError} When required env vars are absent or invalid
 * @author Al Amin Ahamed
 */
export function loadEnv(): z.infer<typeof envSchema> {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const formatted = result.error.issues
      .map((e) => `  ${e.path.join(".")}: ${e.message}`)
      .join("\n");
    throw new Error(`Environment validation failed:\n${formatted}`);
  }
  return result.data;
}

export type Env = z.infer<typeof envSchema>;
