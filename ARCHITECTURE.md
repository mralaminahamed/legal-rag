# Architecture

## Design Rationale

### Why RAG, not fine-tuning

Legal document understanding is a retrieval problem before it is a generation problem. The relevant facts — party names, dates, procedural posture — are explicit in the source document, not latent in model weights. Generating without grounding produces confident hallucinations; fine-tuning on a small corpus overfits to document style without generalising to unseen cases. RAG with per-section retrieval lets us audit exactly which source passage backed each generated claim, which is the property reviewers and downstream systems actually need.

### Why five independent sections

Splitting the draft into Parties, Key Dates, Issues, Procedural History, and Relief Sought and generating each independently serves three purposes: (1) each section has its own retrieval vocabulary, so per-section queries return more relevant chunks than a single broad query; (2) operator edits are section-scoped, making the edit loop's signal extraction precise; (3) citation tracking is per-section, so grounding audits are meaningful at the level of individual claims rather than the document as a whole.

### Why exemplars + preferences over fine-tuning

Fine-tuning requires data collection, model training infrastructure, and redeployment to incorporate new signal. The exemplar-and-preference approach accumulates operator corrections into the inference context on every generation call, with no retraining. It degrades gracefully: if no exemplars exist, generation falls back to pure retrieval-grounded output. The cost is longer prompts; the benefit is that every operator edit immediately improves future drafts.

### Why three chat providers but one embedding provider

The `LLMProvider` interface (`apps/api/src/llm/provider.ts`) abstracts chat completion across Anthropic, OpenAI, and Ollama. This is possible because chat completion is stateless: given a prompt, any sufficiently capable model returns useful text. Embeddings are different. The `chunks.embedding` column is `vector(1536)`, committed at schema creation to match `text-embedding-3-small`. Every HNSW index was built at this dimension. Cosine similarity is only meaningful between embeddings from the same model. Routing embeddings through the provider interface would imply that any provider's embedding model could be substituted — but doing so mid-project would corrupt retrieval results and the exemplar similarity ranking. Keeping embeddings in a dedicated non-pluggable module (`pipeline/embed.ts`) makes this constraint explicit.

---

## Component Walkthrough

### OCR Sidecar (`apps/ocr/`)

FastAPI service in Python 3.11. `extractor.py` implements a three-strategy cascade:

1. **pdfplumber** — fast path for PDFs with a native text layer. If average text extracted is < 50 chars/page, the document is treated as scanned and the strategy falls through.
2. **unstructured hi_res** — uses `partition_pdf` with `strategy="hi_res"` for scanned PDFs. Falls back to tesseract if `unstructured` fails or returns empty output.
3. **tesseract** — rasterises each page at 300 DPI via `pdf2image`, then runs `pytesseract.image_to_data` for per-word confidence scores.

Confidence is reported per-page (1.0 for native text, 0.85 for unstructured, word-level mean for tesseract) and as an overall mean. The Node.js API calls this sidecar over HTTP with a 120-second timeout; the endpoint is `POST /ocr/extract`.

### Ingestion Pipeline (`apps/api/src/pipeline/`)

1. **`ingest.ts`** — top-level orchestrator. Calls OCR sidecar, extracts structured fields, INSERTs the document row, runs chunking and embedding.
2. **`extract-fields.ts`** — one Claude call with a strict JSON prompt extracts parties, key dates, and document type. Validates with Zod; retries once on parse failure; returns empty fields on second failure.
3. **`chunk.ts`** — semantic chunking via embedding-distance breakpoints, inspired by Greg Kamradt's chunking research and the [`tsensei/Semantic-Chunking-Typescript`](https://github.com/tsensei/Semantic-Chunking-Typescript) TypeScript implementation pattern. Splits text into sentences, embeds each, computes cosine distance between consecutive embeddings, identifies breakpoints at the 95th percentile or absolute threshold (0.35), and merges chunks below 100 chars. Returns `Chunk[]` with text, sentence count, and char count.
4. **`embed.ts`** — batches texts in groups of 100, calls OpenAI `text-embedding-3-small`, applies exponential backoff on 429s.

### Database (`db/`)

Postgres 16 with `pgvector` and `pg_trgm` extensions. Schema applied via `db/migrations/001_init.sql`.

| Table | Purpose |
|-------|---------|
| `documents` | One row per ingested file; parties and key_dates as JSONB |
| `chunks` | Text chunks with `vector(1536)` embedding; HNSW cosine index |
| `drafts` | Per-section generated text with citations JSONB; iteration counter |
| `edits` | Operator edits with full diff_ops JSONB and edit classification |
| `edit_exemplars` | High-signal edits embedded on `before_text`; HNSW cosine index |
| `style_preferences` | Per-section accumulated preference profile as JSONB |

The `chunks` table carries two indexes: an HNSW index on `embedding` for cosine distance queries and a GIN index on `to_tsvector('english', text)` for full-text retrieval.

### Retrieval (`apps/api/src/pipeline/retrieve.ts`)

Hybrid retrieval per section:

1. **Vector search** — `SELECT ... 1 - (embedding <=> $query::vector) AS score ... ORDER BY embedding <=> $query LIMIT 8`
2. **Full-text search** — `ts_rank_cd(to_tsvector('english', text), plainto_tsquery(...))` over the GIN index
3. **Reciprocal Rank Fusion** — standard RRF formula: `score(d) = Σ 1 / (60 + rank(d))` across both lists, normalized to [0, 1].

Section-specific query strings (`lib/section-queries.ts`) bias retrieval toward the vocabulary of each section (e.g., "plaintiff defendant counsel attorney party" for the Parties section). The route `POST /retrieve` accepts a document ID and section name and returns the merged ranked chunks.

### Draft Generation (`apps/api/src/pipeline/generate.ts`)

For each of the five sections:
1. Retrieve top-8 chunks via `retrieveForSection`.
2. Pre-embed the section query text (batched across all five sections in one OpenAI call) and fetch the top-3 exemplars from `edit_exemplars` ranked by cosine similarity.
3. Fetch `style_preferences` for the section.
4. Build the section prompt via `lib/prompts/sections/` — a system prompt defining the section scope and citation rules, and a user prompt with XML `<evidence>` blocks, a `PRIOR REVISIONS` block (exemplars), and a `HOUSE STYLE` block (preferences). Evidence is capped at 3,000 characters to fit within Ollama's effective context budget.
5. Call `provider.complete()` — provider chosen by `getLLMProvider()` from `router.ts`.
6. Parse `[c:UUID]` inline citations; strip any UUID not in the retrieved chunk set.
7. Run `verifyGrounding`: embeds the section content and each cited chunk, returns max cosine similarity.
8. INSERT draft row with content, citations JSONB, and iteration number.

### LLM Router (`apps/api/src/llm/`)

`getLLMProvider()` in `router.ts` returns a singleton for the `LLM_PROVIDER` env value (default: `anthropic`). Falls back through `anthropic → openai → ollama` if the primary provider lacks credentials. Each provider class implements `LLMProvider`:

- **`AnthropicProvider`** — Anthropic Messages API, temperature 0.2. `completeJSON` retries once with a corrective prompt on Zod schema mismatch.
- **`OpenAIProvider`** — OpenAI Chat Completions with `response_format: json_object` for `completeJSON`. Temperature 0.2.
- **`OllamaProvider`** — OpenAI SDK pointed at `OLLAMA_BASE_URL`. Temperature 0.3 (higher than cloud providers because smaller open models show more output variance at 0.2, occasionally producing repetitive or degenerate completions). `completeJSON` tries `json_object` format first and falls back to plain completion + `extractJsonFromText` if the model/version doesn't support it. `ping()` checks that the configured model is pulled on the host before the first generation call.

### Edit Loop (`apps/api/src/edit-loop/`)

`POST /edit` pipeline:

1. **`diff.ts`** — `diffWords` from the `diff` library; consecutive removed+added pairs merged into `replace` ops. Returns `DiffOp[]` and `DiffStats`.
2. **`classify.ts`** — one LLM call with diff stats and truncated before/after text. Returns `EditClassification` with class, confidence, and one-sentence reasoning. Falls back to `rephrase/0.3` on LLM failure.
3. **`exemplars.ts`** — `computeSignalScore` heuristic per class (factual_correction: 0.9, omission/addition: 0.7 if > 5 words, rephrase: 0.5, formatting: 0.2). If score ≥ 0.5, embeds `before_text` and INSERTs into `edit_exemplars`. This step runs in a `try/catch`; a failed promotion does not roll back the edit INSERT.
4. **`preferences.ts`** — debounced style summarisation: runs only when ≥ 3 new edits exist since the last update for that section. Sends the last 10 edits to the LLM, receives a JSON preferences object (tone, avoid_phrases, prefer_phrases, formatting_rules), and UPSERTs into `style_preferences`.

---

## Data Flow Diagram

```
┌──────────────┐    ┌─────────────────┐    ┌──────────────────────┐
│ PDF / Image  │ ─► │ Python OCR      │ ─► │ Node.js Ingestion    │
│ (any quality)│    │ Sidecar         │    │ Pipeline             │
└──────────────┘    │ unstructured    │    │ - field extraction   │
                    │ + pdfplumber    │    │ - semantic chunking  │
                    │ + Tesseract     │    │ - embedding          │
                    └─────────────────┘    └─────────┬────────────┘
                                                     │
                                                     ▼
            ┌────────────────────────────────────────────────────┐
            │ Postgres 16 + pgvector + GIN full-text index       │
            │  • documents                                        │
            │  • chunks (text, embedding, page_number, bbox)      │
            │  • drafts (per-section)                             │
            │  • edits (original, edited, diff, classification)   │
            │  • edit_exemplars (high-signal edits, embedded)     │
            │  • style_preferences (cumulative JSON profile)      │
            └────────────────────────┬───────────────────────────┘
                                     │
            ┌────────────────────────▼───────────────────────────┐
            │ Hybrid Retrieval per section                       │
            │  • vector similarity (pgvector cosine)             │
            │  • BM25-style full-text (ts_rank_cd)               │
            │  • reciprocal-rank-fusion merge                    │
            └────────────────────────┬───────────────────────────┘
                                     │
            ┌────────────────────────▼───────────────────────────┐
            │ Draft Generation                                   │
            │  • per-section grounded prompt                     │
            │  • inject relevant edit exemplars (kNN over edits) │
            │  • inject learned style preferences                │
            │  • embedding-similarity grounding verifier         │
            └────────────────────────┬───────────────────────────┘
                                     │
                                     ▼
            ┌────────────────────────────────────────────────────┐
            │ Operator Review / Edit Capture API                 │
            └────────────────────────┬───────────────────────────┘
                                     │
            ┌────────────────────────▼───────────────────────────┐
            │ Edit Loop Processor                                │
            │  • section-level diff (insert/delete/replace ops)  │
            │  • classify edit type (rephrase, factual correction│
            │    formatting, omission, addition)                 │
            │  • embed and store as exemplar (if high-signal)    │
            │  • update style_preferences via summarization      │
            └────────────────────────────────────────────────────┘
```

---

## De-scope Decisions and Tradeoffs

| Decision | What was done | What was de-scoped and why |
|----------|--------------|---------------------------|
| Grounding verifier | Embedding cosine similarity ≥ 0.70 | LLM-as-judge (second Claude call per section). Too slow for the timeline and adds cost proportional to draft length. The embedding proxy is directionally correct and fully automated. |
| Edit classifier | One LLM call per edit | Fine-tuned BERT classifier. Would require training data, GPU, and a separate model serving endpoint. Sufficient signal from the prompted classifier for the edit loop to function. |
| BM25 ranking | `ts_rank_cd` on GIN tsvector index | True BM25 with IDF. `ts_rank_cd` lacks corpus-level IDF weighting. Added as a Phase 2 known limitation; hybrid retrieval still significantly outperforms vector-only. |
| Chunking breakpoints | 95th-percentile distance threshold | Adaptive threshold per document. Per-document calibration would improve chunk quality on short documents; added complexity not worth the gain on this sample set. |
| Embedding lock-in | OpenAI `text-embedding-3-small`, hardcoded | Pluggable embedding provider. The schema dimension commitment makes mid-project switching destructive. Full abstraction would be misleading — see design rationale above. |
| Ollama temperature | 0.3 | Same 0.2 as cloud providers. At 0.2, `qwen2.5:14b` on CPU occasionally produces repetitive completions. 0.3 produces more varied, useful output without sacrificing precision on short structured prompts. |
| 3k char evidence cap | Per-section retrieval evidence capped at 3,000 chars | No cap. Smaller open models (qwen2.5:14b at Q5_K_M quantisation) degrade noticeably on prompts beyond ~4k tokens. Cloud providers (Claude, GPT-4o-mini) handle the full top-8 chunks without quality loss; the cap is a concession to Ollama compatibility. |
| Async ingestion | Synchronous HTTP ingestion | Message queue (BullMQ). For the demo workflow, synchronous ingestion is simpler to operate. Production would use a queue for PDFs > 5 MB. |
| Docker Compose only | Three-service docker-compose.yml | Kubernetes / cloud deployment. Single-command local setup was the highest-priority operational goal for reviewer reproducibility. |

---

## Testing Strategy

Tests target the modules where engineering judgment is visible — not thin pass-throughs.

### What is tested

| Module | Type | What it verifies |
|--------|------|-----------------|
| `pipeline/chunk.ts` | Unit | Breakpoint logic, short-chunk merging, abbreviation preservation, empty input |
| `edit-loop/diff.ts` | Unit | Op types (equal/insert/delete/replace), range correctness, stats computation |
| `edit-loop/classify.ts` | Unit | Classification per edit type, LLM prompt structure, fallback on provider failure |
| `llm/router.ts` | Unit | Provider selection by env, fallback chain, explicit override |
| `__integration__/e2e.test.ts` | Integration | Full DB flow: ingest → draft → edit → citations endpoint |
| `apps/ocr/tests/` | Integration (Python) | OCR strategy cascade: pdfplumber, tesseract, image-only PDF synthesis |

### What is not tested and why

- **Route handlers** (`routes/*.ts`): thin wrappers around pipeline functions. Testing them would duplicate unit-test coverage without adding signal.
- **LLM provider classes** (`llm/anthropic.ts`, `openai.ts`, `ollama.ts`): thin SDK wrappers. Their correctness is guaranteed by the SDK type system; real API calls are not deterministic.
- **Exhaustive path coverage**: the goal is confidence in logic-heavy modules, not a coverage number. Three similar lines are tested once, not three times.

### Mock LLM Provider pattern

`src/__test-helpers__/mock-llm-provider.ts` implements `LLMProvider` with a response map keyed by user-message substrings. Any module under test that calls `getLLMProvider()` can be redirected to this mock via `vi.mock('../llm/router.js')`. The `calls` array records every invocation for prompt-structure assertions. This is the most reusable artifact in the test suite — extend it when adding tests for new LLM-dependent modules.

### Running tests

```bash
npm run test:unit          # vitest unit tests, ~300ms, no services needed
npm test                   # unit + OCR pytest (requires Docker)
npm run test:integration   # requires TEST_DATABASE_URL
```

---

## References

- Greg Kamradt, "5 Levels of Text Splitting" — original semantic chunking breakpoint algorithm that `pipeline/chunk.ts` implements.
- [`tsensei/Semantic-Chunking-Typescript`](https://github.com/tsensei/Semantic-Chunking-Typescript) — TypeScript implementation pattern and inspiration for the embedding-distance approach used here.
- Supabase + pgvector (Talha Jubair Siam's `supabase-swarm`) — production deployment pattern for Postgres + pgvector that this project mirrors in its Docker Compose setup.
