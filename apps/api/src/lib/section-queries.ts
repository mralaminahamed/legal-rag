import type { CaseSummarySection } from "../types.js";

/**
 * Section-specific retrieval query strings that bias hybrid search toward
 * the vocabulary most likely to appear in that section of a legal document.
 * Multiple queries per section are each run independently and merged via RRF.
 *
 * @author Al Amin Ahamed
 */
export const SECTION_QUERIES: Record<CaseSummarySection, string[]> = {
  parties: [
    "plaintiff defendant counsel attorney party representative",
  ],
  key_dates: [
    "filed dated on or about date of hearing deadline",
  ],
  issues: [
    "cause of action alleges claim asserts violation of breach",
  ],
  procedural_history: [
    "motion order ruling court denied granted dismissed filed",
  ],
  relief: [
    "prayer for relief wherefore plaintiff seeks damages judgment injunction",
  ],
};
