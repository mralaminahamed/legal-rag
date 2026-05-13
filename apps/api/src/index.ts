import "dotenv/config";
import { serve } from "@hono/node-server";
import { loadEnv, validateProviderConfig } from "./lib/env.js";
import { logger } from "./lib/logger.js";
import { getLLMProvider } from "./llm/router.js";
import { buildApp } from "./server.js";

const env = loadEnv();
validateProviderConfig(env);

// Resolve and log the selected chat provider at startup
const provider = getLLMProvider();
logger.info(
  { provider: provider.name(), llm_provider_env: env.LLM_PROVIDER },
  "chat provider selected",
);

// Ping Ollama asynchronously — non-blocking; logs a warning if model is missing
if (provider.ping) {
  provider.ping().then((available) => {
    if (available) {
      logger.info({ model: env.OLLAMA_CHAT_MODEL }, "Ollama model available");
    } else {
      logger.warn(
        { model: env.OLLAMA_CHAT_MODEL },
        "Ollama model not available — draft generation will fail until the model is pulled",
      );
    }
  }).catch(() => {
    // ping() already logs internally; swallow here to avoid unhandled rejection
  });
}

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
