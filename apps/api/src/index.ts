import "dotenv/config";
import { serve } from "@hono/node-server";
import { loadEnv, validateProviderConfig } from "./lib/env.js";
import { logger } from "./lib/logger.js";
import { buildApp } from "./server.js";

const env = loadEnv();
validateProviderConfig(env);

const app = buildApp();

serve(
  {
    fetch: app.fetch,
    port: env.PORT_API,
  },
  () => {
    logger.info(
      { port: env.PORT_API, llm_provider: env.LLM_PROVIDER },
      "api service started",
    );
  },
);
