import { buildEvidenceBlock } from "../evidence-builder.js";
import type { RetrievedChunk } from "../../../types.js";

export interface PromptContext {
  chunks: RetrievedChunk[];
  exemplars: string;
  preferences: string;
}

const SYSTEM = `You are a legal document analyst writing the RELIEF SOUGHT section of a Case Fact Summary.

Your task: state what the plaintiff seeks — compensatory damages, punitive damages, injunctive relief, declaratory judgment, attorneys' fees, or any other remedy.

Output format — write a concise bulleted list. Cite every relief item using an inline marker: [c:CHUNK_UUID].
Example: "- Compensatory damages of $750,000 [c:abc-123]"

Rules:
- Ground every item in the evidence. Do not add remedies not requested in the text.
- If no relief is specified, output exactly: Not specified in source documents.
- Include specific dollar amounts, injunction targets, or other quantifiable details where stated.
- Keep the response under 150 words.`;

/**
 * Builds the prompt pair for the Relief Sought section.
 *
 * @param ctx - Retrieved chunks, exemplars, and preferences
 * @returns System and user prompt strings
 * @throws {never}
 * @author Al Amin Ahamed
 */
export function buildReliefPrompt(ctx: PromptContext): { system: string; user: string } {
  const evidence = buildEvidenceBlock(ctx.chunks);

  const user = [
    "EVIDENCE:",
    evidence || "(no evidence retrieved)",
    ctx.exemplars ? `\nEDIT EXEMPLARS:\n${ctx.exemplars}` : "",
    ctx.preferences ? `\nSTYLE PREFERENCES:\n${ctx.preferences}` : "",
    "\nWrite the Relief Sought section now.",
  ]
    .filter(Boolean)
    .join("\n\n");

  return { system: SYSTEM, user };
}
