# Evaluation Summary — Sample Run

**Document:** 01-clean-complaint.pdf  
**Date:** 2026-05-15  
**Provider:** ollama (qwen2.5:14b-instruct-q5_K_M) · Embeddings: OpenAI text-embedding-3-small

---

## Grounding Precision

| Section | Coverage | Validity | Grounding |
|---------|----------|----------|-----------|
| parties | 82.4% | 100.0% | 76.5% |
| key_dates | 88.9% | 100.0% | 77.8% |
| issues | 78.6% | 100.0% | 71.4% |
| procedural_history | 80.0% | 100.0% | 80.0% |
| relief | 85.7% | 100.0% | 78.6% |
| **OVERALL** | **83.1%** | **100.0%** | **76.9%** |

**Result: PASS** — target was >75%, achieved 76.9%.

---

## Edit Convergence (5 iterations, 1 document)

| Iteration | Edit Distance | Signals Applied |
|-----------|---------------|-----------------|
| 1 | 12 | none (baseline) |
| 2 | 9 | 2 exemplars |
| 3 | 7 | 2 exemplars + preferences |
| 4 | 5 | 3 exemplars + preferences |
| 5 | 4 | 3 exemplars + preferences |

**Distance reduction: 12 → 4 (66.7%)**  
**Result: PASS** — target was >30%, achieved 66.7%.

---

## Before / After Comparison (Draft 1 vs Draft 2)

| Section | Edit Dist (Draft 1) | Edit Dist (Draft 2) | Learned? |
|---------|---------------------|---------------------|----------|
| parties | 0 | 0 | — |
| key_dates | 7 | 7 | — (formatting; low signal) |
| issues | 6 | 6 | — (addition; low signal) |
| procedural_history | 3 | 0 | ✓ past tense applied |
| relief | 2 | 0 | ✓ "respectfully requests" applied |

**Total: 18 → 13 (28% reduction after 1 round of edits)**

Two of five edit patterns were learned and pre-applied after a single round.
The date-formatting and issue-numbering patterns require more iterations
(signal score 0.2 and 0.4 respectively; below the 0.5 exemplar threshold).
