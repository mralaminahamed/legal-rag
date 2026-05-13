import type { CaseSummarySection, RetrievedChunk } from "../../../types.js";
import { buildKeyDatesPrompt } from "./key-dates.js";
import { buildIssuesPrompt } from "./issues.js";
import { buildPartiesPrompt } from "./parties.js";
import { buildProceduralHistoryPrompt } from "./procedural-history.js";
import { buildReliefPrompt } from "./relief.js";

export interface PromptContext {
  chunks: RetrievedChunk[];
  exemplars: string;
  preferences: string;
}

/**
 * Dispatches to the correct section-specific prompt builder.
 *
 * @param section - Target case summary section
 * @param ctx - Retrieved chunks, exemplars, and preferences
 * @returns System and user prompt strings ready for the LLM provider
 * @throws {never}
 * @author Al Amin Ahamed
 */
export function buildSectionPrompt(
  section: CaseSummarySection,
  ctx: PromptContext,
): { system: string; user: string } {
  switch (section) {
    case "parties":
      return buildPartiesPrompt(ctx);
    case "key_dates":
      return buildKeyDatesPrompt(ctx);
    case "issues":
      return buildIssuesPrompt(ctx);
    case "procedural_history":
      return buildProceduralHistoryPrompt(ctx);
    case "relief":
      return buildReliefPrompt(ctx);
  }
}
