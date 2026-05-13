/**
 * Shared utilities for LLM provider implementations.
 * @author Al Amin Ahamed
 */

/**
 * Strips markdown code fences from an LLM response so the remainder can be
 * passed directly to JSON.parse. Falls back to the first `{...}` block, then
 * the raw trimmed text.
 *
 * @param text - Raw text from LLM response
 * @returns Extracted JSON candidate string
 * @author Al Amin Ahamed
 */
export function extractJsonFromText(text: string): string {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence?.[1]) return fence[1].trim();
  const bracket = text.match(/(\{[\s\S]*\})/);
  if (bracket?.[1]) return bracket[1].trim();
  return text.trim();
}
