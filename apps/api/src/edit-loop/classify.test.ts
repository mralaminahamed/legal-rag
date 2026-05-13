/**
 * Unit tests for classifyEdit.
 *
 * Injects a mock LLM provider via vi.mock so no real API calls are made.
 * Tests verify: correct classification per edit type, fallback on provider
 * failure, and that the LLM is called with the diff context in the prompt.
 *
 * @author Al Amin Ahamed
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildMockProvider } from "../__test-helpers__/mock-llm-provider.js";
import { computeDiff } from "./diff.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

function cannedClassification(
  cls: string,
  confidence = 0.9,
  reasoning = "test",
): string {
  return JSON.stringify({ class: cls, confidence, reasoning });
}

// ── Mock router so classifyEdit picks up our provider ──────────────────────────

let _mockProvider = buildMockProvider();

vi.mock("../llm/router.js", () => ({
  getLLMProvider: () => _mockProvider,
}));

import { classifyEdit } from "./classify.js";

beforeEach(() => {
  _mockProvider = buildMockProvider();
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("classifyEdit", () => {
  it("factual_correction: changed name/date → returns factual_correction class", async () => {
    _mockProvider = buildMockProvider({
      _default: cannedClassification("factual_correction"),
    });

    const original = "Plaintiff Jane Smith filed on March 1, 2024.";
    const edited = "Plaintiff Joan Smith filed on April 5, 2024.";
    const { ops, stats } = computeDiff(original, edited);

    const result = await classifyEdit(original, edited, ops, stats);
    expect(result.class).toBe("factual_correction");
    expect(result.confidence).toBe(0.9);
  });

  it("rephrase: same meaning, different words → returns rephrase", async () => {
    _mockProvider = buildMockProvider({
      _default: cannedClassification("rephrase", 0.88, "same meaning, different phrasing"),
    });

    const original = "Plaintiff seeks compensatory damages.";
    const edited = "Plaintiff respectfully requests compensatory relief.";
    const { ops, stats } = computeDiff(original, edited);

    const result = await classifyEdit(original, edited, ops, stats);
    expect(result.class).toBe("rephrase");
  });

  it("addition: new content added without removal → returns addition", async () => {
    _mockProvider = buildMockProvider({
      _default: cannedClassification("addition", 0.95),
    });

    const original = "Defendant filed a motion to dismiss.";
    const edited = "Defendant filed a motion to dismiss. Plaintiff's opposition is due within 21 days.";
    const { ops, stats } = computeDiff(original, edited);

    const result = await classifyEdit(original, edited, ops, stats);
    expect(result.class).toBe("addition");
  });

  it("omission: content removed without replacement → returns omission", async () => {
    _mockProvider = buildMockProvider({
      _default: cannedClassification("omission", 0.92),
    });

    const original = "The court denied the motion. The matter is scheduled for April 15.";
    const edited = "The court denied the motion.";
    const { ops, stats } = computeDiff(original, edited);

    const result = await classifyEdit(original, edited, ops, stats);
    expect(result.class).toBe("omission");
  });

  it("formatting: punctuation/case change only → returns formatting", async () => {
    _mockProvider = buildMockProvider({
      _default: cannedClassification("formatting", 0.85),
    });

    const original = "plaintiff filed the complaint.";
    const edited = "Plaintiff filed the complaint.";
    const { ops, stats } = computeDiff(original, edited);

    const result = await classifyEdit(original, edited, ops, stats);
    expect(result.class).toBe("formatting");
  });

  it("calls LLM with original text, edited text, and diff ops in prompt", async () => {
    _mockProvider = buildMockProvider({
      _default: cannedClassification("rephrase"),
    });

    const original = "The plaintiff filed a complaint.";
    const edited = "The plaintiff submitted a complaint.";
    const { ops, stats } = computeDiff(original, edited);

    await classifyEdit(original, edited, ops, stats);

    expect(_mockProvider.calls).toHaveLength(1);
    const call = _mockProvider.calls[0];
    expect(call?.schemaUsed).toBe(true);
    const userContent = call?.opts.messages[0]?.content ?? "";
    expect(userContent).toContain("ORIGINAL TEXT");
    expect(userContent).toContain("EDITED TEXT");
    expect(userContent).toContain("DIFF OPERATIONS");
  });

  it("on provider failure: falls back to rephrase with low confidence", async () => {
    _mockProvider = buildMockProvider({
      // No _default → throws on any call
    });

    const original = "Plaintiff filed.";
    const edited = "Plaintiff submitted.";
    const { ops, stats } = computeDiff(original, edited);

    const result = await classifyEdit(original, edited, ops, stats);
    // classifyEdit catches errors and returns the rephrase fallback
    expect(result.class).toBe("rephrase");
    expect(result.confidence).toBeLessThan(0.5);
  });
});
