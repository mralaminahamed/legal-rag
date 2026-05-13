/**
 * Deterministic operator-style edit patterns applied during evaluation.
 * Shared between simulate-operator.ts and edit-convergence.ts.
 *
 * @author Al Amin Ahamed
 */

const MONTHS: Record<string, string> = {
  January: "01", February: "02", March: "03", April: "04",
  May: "05", June: "06", July: "07", August: "08",
  September: "09", October: "10", November: "11", December: "12",
};

/**
 * Applies a section-specific deterministic operator edit pattern.
 * These patterns are intentionally learnable — consistent across documents
 * so the edit loop can accumulate signal.
 *
 * @param section - Case summary section name
 * @param text - Draft text for that section
 * @returns Edited text with operator-style corrections applied
 * @author Al Amin Ahamed
 */
export function applyEdit(section: string, text: string): string {
  switch (section) {
    case "parties":
      return text.replace(/\bP\.\s*Specter\b/g, "Mr. P. Specter, Esq.");

    case "key_dates":
      return text.replace(
        /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\b/g,
        (_m, month: string, day: string, year: string) =>
          `${year}-${MONTHS[month] ?? "01"}-${day.padStart(2, "0")}`,
      );

    case "issues":
      return text.replace(/^(\d+)\.\s+/gm, (_m, n: string) => `Count ${n}: `);

    case "procedural_history":
      return text
        .replace(/\bdenies\b/g, "denied")
        .replace(/\bfiles\b/g, "filed")
        .replace(/\brequests\b/g, "requested")
        .replace(/\bmoves\b/g, "moved")
        .replace(/\bgrants\b/g, "granted")
        .replace(/\borders\b/g, "ordered");

    case "relief":
      return text
        .replace(/\bPlaintiff seeks\b/g, "Plaintiff respectfully requests")
        .replace(/\bplaintiff seeks\b/g, "plaintiff respectfully requests");

    default:
      return text;
  }
}
