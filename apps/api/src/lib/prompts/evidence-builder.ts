import type { RetrievedChunk } from "../../types.js";

/** Cap total evidence text per section — keeps prompts under 4k tokens for Ollama. */
const MAX_EVIDENCE_CHARS = 3_000;

/**
 * Serializes retrieved chunks as XML evidence blocks for injection into
 * section prompts. Truncates when the total character budget is exceeded
 * so smaller Ollama models receive prompts they can handle.
 *
 * @param chunks - Ranked retrieved chunks, best first
 * @returns Multi-line XML string of <evidence> elements
 * @throws {never}
 * @author Al Amin Ahamed
 */
export function buildEvidenceBlock(chunks: RetrievedChunk[]): string {
  const blocks: string[] = [];
  let total = 0;

  for (const chunk of chunks) {
    const pageAttr = chunk.page_number !== null ? ` page="${chunk.page_number}"` : "";
    const block = `<evidence id="${chunk.id}"${pageAttr}>\n${chunk.text}\n</evidence>`;

    // Always include at least one block even if it exceeds budget
    if (total + block.length > MAX_EVIDENCE_CHARS && blocks.length > 0) break;

    blocks.push(block);
    total += block.length;
  }

  return blocks.join("\n\n");
}
