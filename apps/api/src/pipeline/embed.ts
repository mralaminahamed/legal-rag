import OpenAI from "openai";
import { loadEnv } from "../lib/env.js";
import { logger } from "../lib/logger.js";

const BATCH_SIZE = 100;
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1_000;

let _embedClient: OpenAI | null = null;

function getEmbedClient(): OpenAI {
  if (!_embedClient) {
    const env = loadEnv();
    _embedClient = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }
  return _embedClient;
}

/**
 * Generates embeddings for a list of text strings using OpenAI
 * text-embedding-3-small, batched in groups of 100. Applies exponential
 * backoff on rate limit errors (429) up to MAX_RETRIES attempts.
 *
 * @param texts - Array of strings to embed
 * @returns 2D array of embeddings in the same order as input
 * @throws {Error} When the API fails after all retries
 * @author Al Amin Ahamed
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const env = loadEnv();
  const client = getEmbedClient();
  const allEmbeddings: number[][] = [];

  for (let start = 0; start < texts.length; start += BATCH_SIZE) {
    const batch = texts.slice(start, start + BATCH_SIZE);
    const batchEmbeddings = await embedBatchWithRetry(
      client,
      batch,
      env.OPENAI_EMBEDDING_MODEL,
    );
    allEmbeddings.push(...batchEmbeddings);
  }

  return allEmbeddings;
}

/**
 * Embeds a single batch with exponential backoff on rate limit errors.
 *
 * @param client - Initialized OpenAI client
 * @param batch - Texts to embed (max 100)
 * @param model - Embedding model name from env
 * @returns Array of embedding vectors for the batch
 * @throws {Error} After MAX_RETRIES exhausted
 * @author Al Amin Ahamed
 */
async function embedBatchWithRetry(
  client: OpenAI,
  batch: string[],
  model: string,
): Promise<number[][]> {
  let lastErr: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await client.embeddings.create({
        model,
        input: batch,
        encoding_format: "float",
      });

      return response.data
        .sort((a, b) => a.index - b.index)
        .map((item) => item.embedding);
    } catch (err) {
      lastErr = err;

      const isRateLimit =
        err instanceof OpenAI.APIError && err.status === 429;

      if (!isRateLimit || attempt === MAX_RETRIES - 1) {
        throw err;
      }

      const delay = BASE_DELAY_MS * Math.pow(2, attempt);
      logger.warn({ attempt, delay }, "OpenAI rate limit — backing off");
      await sleep(delay);
    }
  }

  throw lastErr;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
