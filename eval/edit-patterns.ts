/**
 * Substitutive operator-style edit patterns used during evaluation.
 *
 * Every pattern is a REPLACEMENT (not an addition), so the edited text is
 * approximately the same length as the original. This is critical for the
 * edit-loop convergence test: when the model learns the pattern, draft 2
 * should already contain the preferred form, reducing the operator's
 * correction burden.
 *
 * Shared between simulate-operator.ts and edit-convergence.ts.
 *
 * @author Al Amin Ahamed
 */

const MONTHS: Record<string, string> = {
  January: "01", February: "02", March: "03", April: "04",
  May: "05", June: "06", July: "07", August: "08",
  September: "09", October: "10", November: "11", December: "12",
};

const ROMAN: string[] = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

/**
 * Applies a section-specific substitutive operator edit pattern.
 * Returns the operator-preferred form of the provided draft text.
 *
 * @param section - Case summary section name
 * @param text - Draft section content
 * @returns Operator-preferred version of the text
 * @author Al Amin Ahamed
 */
export function applyEdit(section: string, text: string): string {
  switch (section) {

    case "parties":
      // Formalize party references with role labels.
      // Uses negative lookahead to avoid double-substitution on re-runs.
      return text
        .replace(/\bJane Smith\b(?!\s*\('Plaintiff'\))/g, "Jane Smith ('Plaintiff')")
        .replace(/\bGlobal Tech Inc\./g, (m, offset, str) =>
          str.slice(offset).startsWith("Global Tech Inc. ('Defendant')") ? m : "Global Tech Inc. ('Defendant')")
        .replace(/\bJohn Roe\b(?!\s*\('Defendant'\))/g, "John Roe ('Defendant')")
        .replace(/\bMorrison & Foerster LLP\b(?!\s*\(Counsel)/g,
          "Morrison & Foerster LLP (Counsel of Record for Plaintiff)");

    case "key_dates":
      // Standardise written dates to ISO 8601.
      return text.replace(
        /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\b/g,
        (_m, month: string, day: string, year: string) =>
          `${year}-${MONTHS[month] ?? "01"}-${day.padStart(2, "0")}`,
      );

    case "issues": {
      // Replace numeric list markers (1. 2. 3.) with Roman-numeral Count labels.
      let idx = 0;
      return text.replace(/^(\d+)\.\s+/gm, () => `Count ${ROMAN[idx++] ?? String(idx)}: `);
    }

    case "procedural_history":
      // Enforce past tense for completed procedural events.
      return text
        .replace(/\bis scheduled\b/g, "was scheduled")
        .replace(/\bis due\b/g, "was due to be filed")
        .replace(/\bdenies\b/g, "denied")
        .replace(/\bfiles\b/g, "filed")
        .replace(/\brequests\b/g, "requested")
        .replace(/\bmoves\b/g, "moved")
        .replace(/\bgrants\b/g, "granted")
        .replace(/\borders\b/g, "ordered");

    case "relief":
      // Standardise prayer-for-relief phrasing.
      return text
        .replace(
          /\bCompensatory damages of (\$[\d,]+)/g,
          "Compensatory damages in the amount of $1",
        )
        .replace(
          /\bAttorneys' fees and costs\b(?!\s*of suit)/g,
          "Reasonable attorneys' fees and costs of suit",
        )
        .replace(/\bPlaintiff seeks\b/g, "Plaintiff respectfully requests")
        .replace(/\bplaintiff seeks\b/g, "plaintiff respectfully requests");

    default:
      return text;
  }
}
