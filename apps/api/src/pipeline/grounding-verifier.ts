import { embedTexts } from "./embed.js";

/**
 * Computes cosine similarity between two equal-length vectors.
 * Returns 0 for zero-magnitude inputs.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Lightweight embedding-based grounding verifier.
 *
 * Embeds the generated section content and each cited chunk, then returns
 * the maximum cosine similarity between the content and any single chunk.
 * A score near 1.0 means the content closely mirrors its evidence.
 * A score near 0 means the content is semantically distant from cited sources.
 *
 * This is intentionally lightweight — an LLM-as-judge variant is documented
 * in ARCHITECTURE.md as a future enhancement.
 *
 * @param content - Generated section text to evaluate
 * @param citedChunks - Chunks whose IDs appeared as citations in the content
 * @returns Max cosine similarity in [0, 1]; 0 when no chunks provided
 * @throws {Error} When embedTexts fails due to OpenAI API error or network failure
 * @author Al Amin Ahamed
 */
export async function verifyGrounding(
  content: string,
  citedChunks: Array<{ text: string }>,
): Promise<number> {
  if (citedChunks.length === 0) return 0;

  const texts = [content, ...citedChunks.map((c) => c.text)];
  const embeddings = await embedTexts(texts);

  const contentEmb = embeddings[0];
  if (!contentEmb) return 0;

  let maxSim = 0;
  for (let i = 1; i < embeddings.length; i++) {
    const chunkEmb = embeddings[i];
    if (!chunkEmb) continue;
    const sim = cosineSimilarity(contentEmb, chunkEmb);
    if (sim > maxSim) maxSim = sim;
  }

  return maxSim;
}
