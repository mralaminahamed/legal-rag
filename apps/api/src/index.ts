import "dotenv/config";
import { serve } from "@hono/node-server";
import { loadEnv } from "./lib/env.js";
import { logger } from "./lib/logger.js";
import { buildApp } from "./server.js";

const env = loadEnv();
const app = buildApp();

serve(
  {
    fetch: app.fetch,
    port: env.PORT_API,
  },
  () => {
    logger.info({ port: env.PORT_API }, "api service started");
  },
);
