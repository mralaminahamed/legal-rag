import { buildEvidenceBlock } from "../evidence-builder.js";
import type { RetrievedChunk } from "../../../types.js";

export interface PromptContext {
  chunks: RetrievedChunk[];
  exemplars: string;
  preferences: string;
}

const SYSTEM = `You are a legal document analyst writing the PARTIES section of a Case Fact Summary.

Your task: identify and list all plaintiffs, defendants, and counsel of record appearing in the provided evidence.

Output format — write a concise paragraph. Cite every name using an inline marker immediately after it: [c:CHUNK_UUID].
Example: "Plaintiff Jane Smith [c:abc-123] brings this action against Defendant ACME Corp [c:abc-123]."

Rules:
- Ground every claim in the evidence. If a name does not appear in any evidence block, omit it.
- If no party information is present in the evidence, output exactly: Not specified in source documents.
- Do not invent names or infer relationships not stated in the text.
- Keep the response under 150 words.`;

/**
 * Builds the prompt pair for the Parties section.
 *
 * @param ctx - Retrieved chunks, exemplars, and preferences
 * @returns System and user prompt strings
 * @throws {never}
 * @author Al Amin Ahamed
 */
export function buildPartiesPrompt(ctx: PromptContext): { system: string; user: string } {
  const evidence = buildEvidenceBlock(ctx.chunks);

  const user = [
    "EVIDENCE:",
    evidence || "(no evidence retrieved)",
    ctx.exemplars ? `\nEDIT EXEMPLARS:\n${ctx.exemplars}` : "",
    ctx.preferences ? `\nSTYLE PREFERENCES:\n${ctx.preferences}` : "",
    "\nWrite the Parties section now.",
  ]
    .filter(Boolean)
    .join("\n\n");

  return { system: SYSTEM, user };
}
