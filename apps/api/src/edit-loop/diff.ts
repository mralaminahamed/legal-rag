import { diffWords } from "diff";
import type { Change } from "diff";
import type { DiffOp, DiffStats } from "../types.js";

/**
 * Counts non-empty whitespace-delimited words in a string.
 *
 * @param text - Input string
 * @returns Word count
 * @author Al Amin Ahamed
 */
function countWords(text: string): number {
  return text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
}

/**
 * Computes word-level diff statistics from a list of DiffOps.
 *
 * @param ops - Computed diff operations
 * @returns Aggregated stats: words added/removed/replaced and total edit distance
 * @throws {never}
 * @author Al Amin Ahamed
 */
export function computeStats(ops: DiffOp[]): DiffStats {
  let wordsAdded = 0;
  let wordsRemoved = 0;
  let wordsReplaced = 0;
  let totalEditDistance = 0;

  for (const op of ops) {
    switch (op.kind) {
      case "insert":
        wordsAdded += countWords(op.editedText);
        totalEditDistance += countWords(op.editedText);
        break;
      case "delete":
        wordsRemoved += countWords(op.originalText);
        totalEditDistance += countWords(op.originalText);
        break;
      case "replace": {
        const origWords = countWords(op.originalText);
        const editWords = countWords(op.editedText);
        wordsReplaced += Math.max(origWords, editWords);
        totalEditDistance += origWords + editWords;
        break;
      }
      default:
        break;
    }
  }

  return { wordsAdded, wordsRemoved, wordsReplaced, totalEditDistance };
}

/**
 * Computes a word-level diff between two strings using the `diff` library.
 * Consecutive removed+added pairs are merged into "replace" operations for
 * richer signal in downstream classification and exemplar storage.
 *
 * @param original - Source text before operator edit
 * @param edited - Text after operator edit
 * @returns Structured DiffOp list and aggregate statistics
 * @throws {never}
 * @author Al Amin Ahamed
 */
export function computeDiff(
  original: string,
  edited: string,
): { ops: DiffOp[]; stats: DiffStats } {
  const changes: Change[] = diffWords(original, edited);
  const ops: DiffOp[] = [];

  let origPos = 0;
  let editPos = 0;
  let i = 0;

  while (i < changes.length) {
    const curr = changes[i];
    if (!curr) { i++; continue; }

    const next = changes[i + 1];

    if (curr.removed && next?.added) {
      // Merge consecutive remove+add → replace
      ops.push({
        kind: "replace",
        originalRange: [origPos, origPos + curr.value.length],
        editedRange: [editPos, editPos + next.value.length],
        originalText: curr.value,
        editedText: next.value,
      });
      origPos += curr.value.length;
      editPos += next.value.length;
      i += 2;
    } else if (curr.removed) {
      ops.push({
        kind: "delete",
        originalRange: [origPos, origPos + curr.value.length],
        editedRange: [editPos, editPos],
        originalText: curr.value,
        editedText: "",
      });
      origPos += curr.value.length;
      i++;
    } else if (curr.added) {
      ops.push({
        kind: "insert",
        originalRange: [origPos, origPos],
        editedRange: [editPos, editPos + curr.value.length],
        originalText: "",
        editedText: curr.value,
      });
      editPos += curr.value.length;
      i++;
    } else {
      ops.push({
        kind: "equal",
        originalRange: [origPos, origPos + curr.value.length],
        editedRange: [editPos, editPos + curr.value.length],
        originalText: curr.value,
        editedText: curr.value,
      });
      origPos += curr.value.length;
      editPos += curr.value.length;
      i++;
    }
  }

  return { ops, stats: computeStats(ops) };
}
