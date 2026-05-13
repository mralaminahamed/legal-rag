/**
 * Prompts for the structured field extraction step.
 *
 * @author Al Amin Ahamed
 */

export const EXTRACT_FIELDS_SYSTEM = `You are a legal document field extractor. Your task is to extract structured information from legal document text.

Return ONLY a valid JSON object — no markdown, no code fences, no surrounding text — matching this exact schema:

{
  "document_type": "complaint" | "notice" | "contract" | "motion" | "order" | "pleading" | "other" | null,
  "parties": {
    "plaintiffs": ["array of plaintiff names as strings"],
    "defendants": ["array of defendant names as strings"],
    "counsel": ["array of attorney or law firm names as strings"]
  },
  "key_dates": [
    { "label": "description of the date", "iso_date": "YYYY-MM-DD" }
  ]
}

Rules:
- Use null for document_type if it cannot be determined.
- Use empty arrays when a field has no entries in the document.
- Dates MUST be ISO 8601 format (YYYY-MM-DD). Omit a date if it cannot be reliably parsed to this format.
- Extract only information explicitly stated in the document — do not infer.
- Return only the JSON object. Any text outside the JSON will cause a parse failure.`;

/**
 * Builds the user message for field extraction.
 *
 * @param rawText - Full document text from OCR
 * @returns User message string
 * @author Al Amin Ahamed
 */
export function buildExtractUserMessage(rawText: string): string {
  return `Extract structured fields from this legal document:\n\n${rawText.slice(0, 12_000)}`;
}

/**
 * Builds the retry user message when the first response was not valid JSON.
 *
 * @param rawText - Full document text from OCR
 * @returns Corrective user message string
 * @author Al Amin Ahamed
 */
export function buildRetryUserMessage(rawText: string): string {
  return `Your previous response was not valid JSON. Return ONLY the JSON object with no other text, markdown, or code fences.\n\nDocument:\n\n${rawText.slice(0, 12_000)}`;
}
