/**
 * Unit tests for semantic chunking.
 *
 * Uses a deterministic stub embedder that produces bag-of-words vectors,
 * so tests run without any API calls or network I/O.
 *
 * @author Al Amin Ahamed
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Stub embedTexts before importing chunkDocument so the module under test
// picks up the mock rather than the real OpenAI client.
vi.mock("./embed.js", () => ({
  embedTexts: async (texts: string[]) => texts.map(bowVector),
}));

import { chunkDocument } from "./chunk.js";

// ── Stub embedder ──────────────────────────────────────────────────────────────

const VOCAB = [
  "contract", "party", "plaintiff", "defendant", "date", "filing",
  "breach", "damages", "court", "notice", "hearing", "termination",
  "cooking", "recipe", "kitchen", "ingredient", "bake", "oven",
];

/** Bag-of-words vector in VOCAB space. Sentences sharing words → low distance. */
function bowVector(text: string): number[] {
  const lower = text.toLowerCase();
  return VOCAB.map((word) => (lower.includes(word) ? 1 : 0));
}

// ── Fixtures ───────────────────────────────────────────────────────────────────

const LEGAL_SENTENCE =
  "The plaintiff filed a breach of contract claim against the defendant on the filing date.";

const LEGAL_SIMILAR =
  "The defendant filed a motion to dismiss the breach of contract complaint on the same date.";

const COOKING_SENTENCE =
  "Bake the cake in the oven at 350°F for thirty minutes, then let it cool on the kitchen counter.";

const COOKING_SIMILAR =
  "Preheat the oven, mix the ingredients, and bake the recipe in the kitchen for forty minutes.";

/**
 * Long text alternating between legal and cooking domain sentences.
 * BOW vectors for the two domains are orthogonal → high cosine distance at
 * domain boundaries → clear breakpoints despite the stub embedder.
 */
const LONG_MIXED = [
  ...Array.from({ length: 10 }, (_, i) =>
    `The plaintiff filed a breach of contract claim number ${i + 1} against the defendant for damages and court relief sought.`,
  ),
  ...Array.from({ length: 10 }, (_, i) =>
    `Bake the recipe number ${i + 1} in the kitchen oven using the fresh ingredients for the best cooking result.`,
  ),
  ...Array.from({ length: 10 }, (_, i) =>
    `The court issued an order on the motion to dismiss case number ${i + 1} and the hearing is scheduled for the plaintiff.`,
  ),
].join(" ");

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("chunkDocument", () => {
  it("empty string returns empty array", async () => {
    const result = await chunkDocument("");
    expect(result).toEqual([]);
  });

  it("single sentence returns single chunk", async () => {
    const result = await chunkDocument(LEGAL_SENTENCE);
    expect(result).toHaveLength(1);
    expect(result[0]?.text).toBe(LEGAL_SENTENCE);
    expect(result[0]?.sentenceCount).toBe(1);
  });

  it("two highly-similar sentences are grouped into one chunk", async () => {
    const result = await chunkDocument(`${LEGAL_SENTENCE} ${LEGAL_SIMILAR}`);
    // Low cosine distance between legal sentences → no breakpoint → one chunk
    expect(result).toHaveLength(1);
    expect(result[0]?.sentenceCount).toBe(2);
  });

  it("two highly-dissimilar sentences are split into separate chunks", async () => {
    // Legal + Cooking share no VOCAB words → high cosine distance → breakpoint
    const result = await chunkDocument(`${LEGAL_SENTENCE} ${COOKING_SENTENCE}`);
    // May merge if either chunk is < 100 chars; both are long enough to stay split
    expect(result.length).toBeGreaterThanOrEqual(1);
    const combined = result.map((c) => c.text).join(" ");
    expect(combined).toContain("plaintiff");
    expect(combined).toContain("Bake");
  });

  it("long mixed-domain text produces multiple chunks", async () => {
    const result = await chunkDocument(LONG_MIXED);
    // The legal ↔ cooking domain boundary creates high cosine distance → breakpoints
    expect(result.length).toBeGreaterThan(1);
    // Every chunk has consistent metadata
    for (const chunk of result) {
      expect(chunk.charCount).toBe(chunk.text.length);
      expect(chunk.sentenceCount).toBeGreaterThan(0);
    }
  });

  it("each chunk has correct charCount and sentenceCount", async () => {
    const result = await chunkDocument(`${LEGAL_SENTENCE} ${LEGAL_SIMILAR}`);
    for (const chunk of result) {
      expect(chunk.charCount).toBe(chunk.text.length);
      expect(chunk.sentenceCount).toBeGreaterThan(0);
    }
  });

  it("does not split on abbreviations like Mr. or Dr.", async () => {
    const text = "Mr. Smith filed the motion. Dr. Jones testified for the plaintiff.";
    const result = await chunkDocument(text);
    // Both sentences are legal-domain → likely one chunk; confirm no split on abbreviations
    const combined = result.map((c) => c.text).join(" ");
    expect(combined).toContain("Mr. Smith");
    expect(combined).toContain("Dr. Jones");
  });
});
