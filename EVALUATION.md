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

The 0.70 threshold was chosen empirically: it reliably separates passages that discuss the same clause from passages that are semantically unrelated.

### Limitations

- **Embedding similarity as a proxy for grounding**: cosine similarity ≥ 0.70 is a necessary but not sufficient condition for factual grounding. A sentence that closely paraphrases a chunk may score above the threshold while still misrepresenting a fact. An NLI-based verifier would be more precise but is out of scope for this timeline.
- **Sentence splitting is heuristic**: the regex-based sentence splitter may merge or over-split complex legal sentences, affecting per-sentence counts.
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
      - **parties**: `"P. Specter"` → `"Mr. P. Specter, Esq."` (formatting)
      - **key_dates**: long-form date → ISO 8601 (formatting)
      - **issues**: prepend `"Count N:"` to numbered items (addition)
      - **procedural_history**: present tense → past tense verbs (rephrase)
      - **relief**: `"Plaintiff seeks"` → `"Plaintiff respectfully requests"` (rephrase)
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

See [`eval/results/run-001.md`](eval/results/run-001.md) for the baseline run.

| Metric | Value | Target |
|--------|-------|--------|
| Mean grounding precision | 76.1% | > 75% |
| Edit distance reduction (iter 1 → 5) | 70.2% | > 30% |

Both targets are met. The grounding precision is above the 75% floor and close to the 85% stretch goal; the primary gap is in the `issues` section, where shorter generated sentences are harder to attribute to a single retrieved chunk. The edit convergence strongly exceeds the 30% target, confirming that the exemplar retrieval and preference injection mechanism is functioning as designed.

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
