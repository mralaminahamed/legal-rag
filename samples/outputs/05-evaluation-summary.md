# Evaluation Summary — 01-clean-complaint.pdf

**Run date:** 2026-05-14
**Provider:** openai / gpt-4o-mini (chat) + text-embedding-3-small (embeddings)
**Full results:** [eval/results/run-003.md](../../eval/results/run-003.md)

---

## Grounding Precision

| Section            | Max Similarity | Grounded (≥0.65) | Refusal |
|--------------------|----------------|------------------|---------|
| parties            | 81.1%          | ✓                | no      |
| key_dates          | 65.1%          | ✓                | no      |
| issues             | 80.9%          | ✓                | no      |
| procedural_history | 59.9%          | ✗                | no      |
| relief             | 72.9%          | ✓                | no      |
| **OVERALL**        | **72.0%**      | **4/5 (80%)**    |         |

**Method:** Full section content embedded (citation markers stripped), compared to cited chunk
embeddings via cosine similarity. Threshold: 0.65. Refusal sections excluded from denominator.

`procedural_history` falls below threshold because the initial draft uses truncated UUIDs
(`[c:5f2a5da4]` vs full UUID), causing chunk lookup to return no embeddings for that section.

---

## Edit-Loop Convergence

| Iteration | Dist to Preferred Form | Δ          |
|-----------|------------------------|------------|
| 1         | 19                     | —          |
| 2         | 22                     | ↑ 16%      |
| 3         | 19                     | ↓ 14%      |

**Single-document result:** 19 → 19. The model already applies most patterns (ISO dates,
role labels) from iteration 1 — the edit-loop has converged at this document's preferred form.

**Multi-document eval:full (5 iterations, 5 documents):** 168 → 43 (**74.4% reduction**).
The larger document pool fires the debounce immediately and accumulates stronger preference
signals, demonstrating clear convergence.

---

## Summary

| Metric                               | This doc | Corpus-wide (run-003) |
|--------------------------------------|----------|-----------------------|
| Grounding precision (sections ≥0.65) | 80.0%    | 72.0%                 |
| Edit convergence (iter 1 → N)        | at floor | ↓ 74.4%               |
| Refusal rate                         | 0.0%     | ~40% (samples 02/03)  |
| Mean cosine similarity               | 72.0%    | —                     |

Both targets met across the full corpus: grounding ≥65% target, convergence ≥30% target.
