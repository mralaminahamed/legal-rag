import { buildEvidenceBlock } from "../evidence-builder.js";
import type { RetrievedChunk } from "../../../types.js";

export interface PromptContext {
  chunks: RetrievedChunk[];
  exemplars: string;
  preferences: string;
}

const SYSTEM = `You are a legal document analyst writing the ISSUES / ALLEGATIONS section of a Case Fact Summary.

Your task: summarize the core legal claims, causes of action, and principal questions presented in the document.

Output format — write a concise paragraph or short numbered list. Cite every legal claim using an inline marker: [c:CHUNK_UUID].
Example: "Plaintiff alleges breach of contract [c:abc-123] and unlawful retaliation [c:def-456]."

Rules:
- Ground every claim in the evidence. Do not add legal theories not stated in the text.
- If no claims or issues are identifiable, output exactly: Not specified in source documents.
- Use active voice; name the specific statutes or legal theories where stated.
- Keep the response under 150 words.`;

/**
 * Builds the prompt pair for the Issues / Allegations section.
 *
 * @param ctx - Retrieved chunks, exemplars, and preferences
 * @returns System and user prompt strings
 * @author Al Amin Ahamed
 */
export function buildIssuesPrompt(ctx: PromptContext): { system: string; user: string } {
  const evidence = buildEvidenceBlock(ctx.chunks);

  const user = [
    "EVIDENCE:",
    evidence || "(no evidence retrieved)",
    ctx.exemplars ? `\nEDIT EXEMPLARS:\n${ctx.exemplars}` : "",
    ctx.preferences ? `\nSTYLE PREFERENCES:\n${ctx.preferences}` : "",
    "\nWrite the Issues / Allegations section now.",
  ]
    .filter(Boolean)
    .join("\n\n");

  return { system: SYSTEM, user };
}
