# Evaluation Methodology and Results

## Overview

Two complementary evaluation strategies cover the two highest-weighted rubric dimensions:

1. **Grounding Precision** — validates that generated text is factually anchored to retrieved source material.
2. **Edit Convergence** — validates that the edit-loop improvement mechanism reduces operator correction effort over time.

Neither strategy requires human annotation or an LLM-as-judge. Both are fully automated and reproducible with `npm run eval:full`.

---

## Strategy 1: Grounding Precision

### Methodology

For each generated Case Fact Summary section, every sentence is evaluated against three criteria:

| Criterion | Check |
|-----------|-------|
| **Citation coverage** | Does the sentence carry at least one `[c:UUID]` inline citation? |
| **Citation validity** | Does the cited chunk UUID exist in the `chunks` table? |
| **Grounding precision** | Is the cosine similarity between the sentence embedding and the cited chunk embedding ≥ 0.70? |

Sentence embeddings and chunk embeddings both use OpenAI `text-embedding-3-small` (1536 dimensions, locked at schema creation). Cosine similarity is computed directly — no learned classifier is involved.

**Aggregate metrics reported:**

- `citation_coverage` = sentences with citation / total sentences
- `citation_validity` = sentences with valid citation / sentences with citation
- `grounding_precision` = sentences with similarity ≥ 0.70 / total sentences

The 0.70 threshold was chosen empirically: it reliably separates passages that discuss the same clause from passages that are semantically unrelated, while accommodating the natural paraphrase distance between a short generated claim and a full paragraph source chunk.

### Refusal Behavior and Its Effect on Metrics

The system deliberately refuses to generate content for sections that lack supporting evidence in the source document. A court notice (sample 02) legitimately has no prayer-for-relief content; generating one would be fabrication. The string "Not specified in source documents." is the system's grounded refusal marker.

Grounding precision excludes refusal sentences from the denominator — a refusal is correct behavior, not an ungrounded claim. Refusal rate is tracked separately per section. This deliberate design choice prioritizes grounded behavior over surface completeness, eliminating the most damaging failure mode of RAG systems: confident hallucination.

### Limitations

- **Embedding similarity as a proxy for grounding**: cosine similarity ≥ 0.70 is a necessary but not sufficient condition for factual grounding. A sentence that closely paraphrases a chunk may score above the threshold while still misrepresenting a fact. An NLI-based verifier would be more precise but is out of scope for this timeline.
- **Line-level splitting**: the evaluator measures one line/bullet at a time. Multi-sentence paragraphs are treated as a single unit; very long paragraphs may have inflated similarity due to topical breadth.
- **Small sample set**: results are computed over 3–5 synthetic PDF inputs. Real legal documents are longer and noisier; results on those may differ.
- **Citation density bias**: sections that generate more verbose text may dilute citation coverage even when every factual claim is grounded.

---

## Strategy 2: Edit Convergence

### Methodology

The edit-loop improvement mechanism is evaluated by measuring how much the total word-level edit distance decreases across N=5 iterations for a fixed document set.

**Procedure:**

1. Reset `edit_exemplars` and `style_preferences` tables (requires `CONFIRM_RESET=1`).
2. For each iteration:
   a. Generate a fresh draft for all documents in the evaluation set.
   b. Apply the same deterministic operator-style edit patterns to each section:
      - **parties**: add role labels, e.g. `"Jane Smith"` → `"Jane Smith ('Plaintiff')"` (formatting)
      - **key_dates**: long-form date → ISO 8601, e.g. `"January 8, 2024"` → `"2024-01-08"` (formatting)
      - **issues**: numbered items → Roman-numeral Count labels, e.g. `"1. Breach"` → `"Count I: Breach"` (formatting)
      - **procedural_history**: present tense → past tense verbs, e.g. `"files"` → `"filed"` (rephrase)
      - **relief**: standardise prayer phrasing, e.g. `"Plaintiff seeks"` → `"Plaintiff respectfully requests"` (rephrase)
   c. Submit each edit to `POST /edit`.
   d. Record total word-level edit distance (diffWords word count).
3. Report the distance series and percentage reduction from iteration 1 to iteration 5.

Word-level edit distance is computed using the `diff` library's `diffWords` function — the same function used by the production `computeDiff` module, so evaluation and production are measuring the same quantity.

### Edit-loop signal path

Each submitted edit flows through:
- `classifyEdit` → LLM-assigned class (formatting, rephrase, factual_correction, etc.)
- `computeSignalScore` → 0.2–0.9 depending on class and word-count delta
- `promoteToExemplar` → embeds `before_text`, stores in `edit_exemplars` (if score ≥ 0.5)
- `updateStylePreferences` → LLM summarises last 10 edits per section into a JSON preference profile (debounced: fires after every 3 new edits per section)

On the next draft generation, the pipeline:
- Fetches top-3 exemplars per section ranked by cosine similarity to the section query embedding
- Fetches the `style_preferences` JSON for the section
- Injects both as `PRIOR REVISIONS` and `HOUSE STYLE` blocks in the section prompt

The edit patterns used here are intentionally learnable: they are consistent across documents and sections, with no random variation. This is a known limitation — real operator edits are less uniform.

### Limitations

- **Synthetic edits**: all five edit patterns are deterministic string replacements. Real operators apply more varied, context-dependent edits. Synthetic patterns set an upper bound on what the edit loop can learn; real-world signal would be noisier.
- **Small vocabulary**: the "P. Specter" pattern only fires when that exact string appears, which is rare in generated text. The date and phrasing patterns provide stronger signal.
- **Single-document set**: all iterations use the same 3–5 documents. In production, different documents would exercise different retrieval paths; exemplar similarity matching would have a larger pool to draw from.
- **Debounce and iteration count interaction**: with 1 document × 5 sections = 5 edits per iteration, the debounce threshold (3 edits per section) is met only after 3 iterations per section. Using 3 documents ensures the debounce fires immediately, producing faster preference accumulation.
- **Embedding cost**: grounding verification on all sentences requires an OpenAI API call per evaluation run. This is unavoidable given the embedding-similarity proxy approach.

---

## Results

See [`eval/results/run-003.md`](eval/results/run-003.md) for the latest run.

| Metric | Value | Target |
|--------|-------|--------|
| Mean grounding precision (refusals excluded) | 72.0% | > 65% |
| Edit distance reduction (iter 1 → 5) | 74.4% | > 30% |

Both targets are met. Grounding precision is measured with refusal sections excluded from the denominator — samples 02 and 03 intentionally produce "Not specified" for sections with no source evidence (correct behavior). The edit convergence strongly exceeds the 30% target: edit distance falls from 168 (iteration 1) to 43 (iteration 5), confirming the exemplar retrieval and preference injection mechanism is functioning as designed. See the Refusal Behavior section above for how refusals are treated in the metric.

---

## Reproducing Results

```bash
# Set real API keys in .env
# OPENAI_API_KEY is required for embeddings regardless of LLM_PROVIDER

# Ingest sample documents first
node_modules/.bin/tsx scripts/test-ingest.ts samples/inputs/01-clean-complaint.pdf
node_modules/.bin/tsx scripts/test-ingest.ts samples/inputs/02-scanned-notice.pdf
node_modules/.bin/tsx scripts/test-ingest.ts samples/inputs/03-low-quality-contract.pdf

# Run full evaluation (writes eval/results/run-NNN.md)
CONFIRM_RESET=1 npm run eval:full

# Or run individual evaluations:
npm run eval:grounding
CONFIRM_RESET=1 npm run eval:convergence
```
