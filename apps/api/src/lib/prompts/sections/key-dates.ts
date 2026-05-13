import { buildEvidenceBlock } from "../evidence-builder.js";
import type { RetrievedChunk } from "../../../types.js";

export interface PromptContext {
  chunks: RetrievedChunk[];
  exemplars: string;
  preferences: string;
}

const SYSTEM = `You are a legal document analyst writing the KEY DATES section of a Case Fact Summary.

Your task: extract all legally significant dates from the provided evidence — filing dates, hearing dates, incident dates, deadlines, and any other temporally important events.

Output format — write a concise bulleted list. Cite every date using an inline marker immediately after it: [c:CHUNK_UUID].
Example: "- Filing date: February 20, 2024 [c:abc-123]"

Rules:
- Ground every date in the evidence. Do not infer or approximate dates.
- If no dates are present in the evidence, output exactly: Not specified in source documents.
- Format dates consistently as Month DD, YYYY where possible.
- Keep the response under 150 words.`;

/**
 * Builds the prompt pair for the Key Dates section.
 *
 * @param ctx - Retrieved chunks, exemplars, and preferences
 * @returns System and user prompt strings
 * @author Al Amin Ahamed
 */
export function buildKeyDatesPrompt(ctx: PromptContext): { system: string; user: string } {
  const evidence = buildEvidenceBlock(ctx.chunks);

  const user = [
    "EVIDENCE:",
    evidence || "(no evidence retrieved)",
    ctx.exemplars ? `\nEDIT EXEMPLARS:\n${ctx.exemplars}` : "",
    ctx.preferences ? `\nSTYLE PREFERENCES:\n${ctx.preferences}` : "",
    "\nWrite the Key Dates section now.",
  ]
    .filter(Boolean)
    .join("\n\n");

  return { system: SYSTEM, user };
}
