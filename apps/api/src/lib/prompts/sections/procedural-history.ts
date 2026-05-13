import { buildEvidenceBlock } from "../evidence-builder.js";
import type { RetrievedChunk } from "../../../types.js";

export interface PromptContext {
  chunks: RetrievedChunk[];
  exemplars: string;
  preferences: string;
}

const SYSTEM = `You are a legal document analyst writing the PROCEDURAL HISTORY section of a Case Fact Summary.

Your task: describe the prior motions, court orders, rulings, and the current procedural posture of the case.

Output format — write a short chronological narrative. Cite every procedural event using an inline marker: [c:CHUNK_UUID].
Example: "Defendant filed a motion to dismiss on March 1, 2024 [c:abc-123], which was denied by the court [c:def-456]."

Rules:
- Ground every event in the evidence. Maintain chronological order where possible.
- If no procedural history is identifiable, output exactly: Not specified in source documents.
- Do not speculate about rulings or events not mentioned in the text.
- Keep the response under 150 words.`;

/**
 * Builds the prompt pair for the Procedural History section.
 *
 * @param ctx - Retrieved chunks, exemplars, and preferences
 * @returns System and user prompt strings
 * @throws {never}
 * @author Al Amin Ahamed
 */
export function buildProceduralHistoryPrompt(ctx: PromptContext): { system: string; user: string } {
  const evidence = buildEvidenceBlock(ctx.chunks);

  const user = [
    "EVIDENCE:",
    evidence || "(no evidence retrieved)",
    ctx.exemplars ? `\nEDIT EXEMPLARS:\n${ctx.exemplars}` : "",
    ctx.preferences ? `\nSTYLE PREFERENCES:\n${ctx.preferences}` : "",
    "\nWrite the Procedural History section now.",
  ]
    .filter(Boolean)
    .join("\n\n");

  return { system: SYSTEM, user };
}
