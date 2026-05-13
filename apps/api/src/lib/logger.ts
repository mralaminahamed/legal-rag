import pino from "pino";

/**
 * Creates a pino logger instance configured from the LOG_LEVEL environment
 * variable. Falls back to "info" when the variable is absent so the app
 * remains usable before env validation runs.
 *
 * @returns Configured pino logger instance
 * @author Al Amin Ahamed
 */
export function createLogger(): pino.Logger {
  const level = process.env["LOG_LEVEL"] ?? "info";

  if (process.env["NODE_ENV"] !== "production") {
    return pino({
      level,
      transport: { target: "pino-pretty", options: { colorize: true } },
    });
  }

  return pino({ level });
}

export const logger = createLogger();
