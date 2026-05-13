import { Hono } from "hono";
import { logger } from "./lib/logger.js";

const VERSION = "0.1.0";

/**
 * Builds and returns the Hono application instance with all routes registered.
 * Routes for ingest, draft, edit, and retrieve are added in later phases.
 *
 * @returns Configured Hono application
 * @author Al Amin Ahamed
 */
export function buildApp(): Hono {
  const app = new Hono();

  app.get("/health", (c) => {
    logger.debug("health check");
    return c.json({ status: "ok", service: "api", version: VERSION });
  });

  return app;
}
