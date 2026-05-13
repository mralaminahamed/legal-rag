import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "./lib/logger.js";
import { ingestRouter } from "./routes/ingest.js";
import { retrieveRouter } from "./routes/retrieve.js";
import { draftRouter } from "./routes/draft.js";
import { editRouter } from "./routes/edit.js";
import { documentsRouter } from "./routes/documents.js";

const VERSION = "0.1.0";

/**
 * Builds and returns the Hono application instance with all routes registered.
 *
 * @returns Configured Hono application
 * @throws {never}
 * @author Al Amin Ahamed
 */
export function buildApp(): Hono {
  const app = new Hono();

  app.use(cors({ origin: "*" }));

  app.get("/health", (c) => {
    logger.debug("health check");
    return c.json({ status: "ok", service: "api", version: VERSION });
  });

  app.route("/documents", documentsRouter);
  app.route("/ingest", ingestRouter);
  app.route("/retrieve", retrieveRouter);
  app.route("/draft", draftRouter);
  app.route("/edit", editRouter);

  return app;
}
