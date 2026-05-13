/**
 * Unit tests for computeDiff and computeStats.
 * No external dependencies — pure string operations via the diff library.
 *
 * @author Al Amin Ahamed
 */

import { describe, it, expect } from "vitest";
import { computeDiff, computeStats } from "./diff.js";

describe("computeDiff", () => {
  it("identical strings produce only equal ops with zero edit distance", () => {
    const text = "The plaintiff filed a complaint in the Southern District of New York.";
    const { ops, stats } = computeDiff(text, text);

    expect(ops.every((op) => op.kind === "equal")).toBe(true);
    expect(stats.totalEditDistance).toBe(0);
    expect(stats.wordsAdded).toBe(0);
    expect(stats.wordsRemoved).toBe(0);
  });

  it("pure addition — only insert ops, wordsAdded reflects new words", () => {
    const { ops, stats } = computeDiff(
      "Plaintiff filed the motion.",
      "Plaintiff filed the motion. Defendant opposed.",
    );

    const nonEqual = ops.filter((op) => op.kind !== "equal");
    expect(nonEqual.every((op) => op.kind === "insert")).toBe(true);
    expect(stats.wordsAdded).toBeGreaterThan(0);
    expect(stats.wordsRemoved).toBe(0);
    expect(stats.totalEditDistance).toBe(stats.wordsAdded);
  });

  it("pure deletion — only delete ops, wordsRemoved reflects removed words", () => {
    const { ops, stats } = computeDiff(
      "Plaintiff filed the motion. Defendant opposed.",
      "Plaintiff filed the motion.",
    );

    const nonEqual = ops.filter((op) => op.kind !== "equal");
    expect(nonEqual.every((op) => op.kind === "delete")).toBe(true);
    expect(stats.wordsRemoved).toBeGreaterThan(0);
    expect(stats.wordsAdded).toBe(0);
    expect(stats.totalEditDistance).toBe(stats.wordsRemoved);
  });

  it("word substitution produces replace ops with correct text content", () => {
    const { ops } = computeDiff(
      "Plaintiff seeks compensatory damages.",
      "Plaintiff respectfully requests compensatory damages.",
    );

    const replaces = ops.filter((op) => op.kind === "replace");
    expect(replaces.length).toBeGreaterThan(0);
    // The replaced region should involve "seeks" → "respectfully requests"
    const hasSeeks = replaces.some((op) => op.originalText.includes("seeks"));
    expect(hasSeeks).toBe(true);
  });

  it("mixed edits produce correct op sequence and stats", () => {
    const original = "The defendant filed a motion to dismiss on March 1, 2024.";
    const edited = "The defendant filed a motion to compel on April 15, 2024.";
    const { ops, stats } = computeDiff(original, edited);

    // Must contain equal ops (the shared prefix)
    expect(ops.some((op) => op.kind === "equal")).toBe(true);
    // "dismiss" → "compel" and "March 1" → "April 15" are changes
    expect(stats.totalEditDistance).toBeGreaterThan(0);
    expect(stats.wordsReplaced).toBeGreaterThan(0);
  });

  it("originalRange and editedRange are non-negative and ordered", () => {
    const { ops } = computeDiff(
      "The plaintiff filed a complaint.",
      "The defendant answered the complaint.",
    );

    for (const op of ops) {
      expect(op.originalRange[0]).toBeGreaterThanOrEqual(0);
      expect(op.originalRange[1]).toBeGreaterThanOrEqual(op.originalRange[0]);
      expect(op.editedRange[0]).toBeGreaterThanOrEqual(0);
      expect(op.editedRange[1]).toBeGreaterThanOrEqual(op.editedRange[0]);
    }
  });
});

describe("computeStats", () => {
  it("empty ops array returns all-zero stats", () => {
    const stats = computeStats([]);
    expect(stats).toEqual({
      wordsAdded: 0,
      wordsRemoved: 0,
      wordsReplaced: 0,
      totalEditDistance: 0,
    });
  });

  it("replace op: wordsReplaced = max(orig, edit), distance = sum", () => {
    const stats = computeStats([{
      kind: "replace",
      originalRange: [0, 5],
      editedRange: [0, 10],
      originalText: "seeks",         // 1 word
      editedText: "respectfully requests",  // 2 words
    }]);

    expect(stats.wordsReplaced).toBe(2);  // max(1, 2)
    expect(stats.totalEditDistance).toBe(3); // 1 + 2
  });

  it("insert op: wordsAdded = word count of inserted text", () => {
    const stats = computeStats([{
      kind: "insert",
      originalRange: [0, 0],
      editedRange: [0, 20],
      originalText: "",
      editedText: "in the amount of",  // 4 words
    }]);

    expect(stats.wordsAdded).toBe(4);
    expect(stats.totalEditDistance).toBe(4);
  });

  it("delete op: wordsRemoved = word count of removed text", () => {
    const stats = computeStats([{
      kind: "delete",
      originalRange: [0, 10],
      editedRange: [0, 0],
      originalText: "Defendant opposed",  // 2 words
      editedText: "",
    }]);

    expect(stats.wordsRemoved).toBe(2);
    expect(stats.totalEditDistance).toBe(2);
  });
});
