# Legal Document RAG — Case Fact Summary Generation

> Retrieval-augmented generation for legal documents with grounded five-section drafting and edit-loop improvement.

## Overview

This system ingests legal PDFs and images (including low-quality scans), extracts structured fields, and generates a grounded five-section Case Fact Summary covering Parties, Key Dates, Issues/Allegations, Procedural History, and Relief Sought. Every factual claim in the generated text carries an inline citation referencing the exact source chunk it was drawn from. A retrieval inspector endpoint exposes the evidence behind any draft section, making the grounding chain fully auditable.

A minimal React web UI (`apps/web/`) provides a browser-based workflow: drag-and-drop upload, auto-generated draft view with inline citation badges, section-level edit modal with signal classification feedback, and a side-by-side draft comparison view with word-level diff highlighting.

The system is designed to improve over time from operator corrections. When an editor revises a generated section, the edit is diffed, classified (rephrase, factual correction, formatting, omission, or addition), and — if the signal is strong enough — embedded and stored as a few-shot exemplar. Subsequent drafts on similar documents retrieve those exemplars and inject a learned style-preference profile, reducing the operator's correction burden with each iteration. The chat layer is intentionally model-agnostic: Anthropic Claude, OpenAI GPT-4o-mini, and a local Ollama model all implement the same `LLMProvider` interface and are switchable with a single environment variable. Embeddings are pinned to OpenAI `text-embedding-3-small` at 1536 dimensions — this is a schema-level commitment, not a pluggability gap.

## Architecture

Documents move through an OCR sidecar (Python, three-strategy cascade: pdfplumber → unstructured → tesseract), semantic chunking via embedding-distance breakpoints, and hybrid vector + full-text retrieval with reciprocal-rank fusion. Five parallel retrieval passes, one per Case Fact Summary section, feed section-specific grounded prompts. Retrieved exemplars and learned preferences from prior edits are injected into each prompt. See [ARCHITECTURE.md](ARCHITECTURE.md) for the full design narrative.

```
            ┌────────────────────────────────────────────────────┐
            │ React SPA — http://localhost:5173                  │
            │  Upload → Draft → Edit → Compare (word diff)       │
            └────────────────────────┬───────────────────────────┘
                                     │ REST (CORS)
                                     ▼
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
            │  • documents  • chunks (text, embedding)           │
            │  • drafts (per-section) • edits                    │
            │  • edit_exemplars • style_preferences              │
            └────────────────────────┬───────────────────────────┘
                                     │
            ┌────────────────────────▼───────────────────────────┐
            │ Hybrid Retrieval (vector + ts_rank_cd + RRF)       │
            └────────────────────────┬───────────────────────────┘
                                     │
            ┌────────────────────────▼───────────────────────────┐
            │ Draft Generation (five sections in parallel)       │
            │  • grounded prompt + exemplars + preferences       │
            └────────────────────────┬───────────────────────────┘
                                     │
            ┌────────────────────────▼───────────────────────────┐
            │ Edit Loop: diff → classify → exemplar → prefs      │
            └────────────────────────────────────────────────────┘
```

## Setup

```bash
git clone https://github.com/mralaminahamed/legal-rag.git
cd legal-rag
cp .env.example .env
```

---

### Option A — Cloud (recommended for first run, ~5 min first build)

Requires an Anthropic **or** OpenAI key for chat, plus an OpenAI key for embeddings.

```bash
# In .env — pick one provider for chat, OpenAI is always needed for embeddings:

# If you have an OpenAI key only:
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...

# If you have an Anthropic key (+ OpenAI for embeddings):
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
```

**Why is `OPENAI_API_KEY` always required?** The `chunks` table stores vectors at 1536 dimensions (`vector(1536)`), matching OpenAI's `text-embedding-3-small` output. Every HNSW index on the table was built at this dimension. Switching embedding providers would require a full schema migration, re-embedding every chunk, and rebuilding all indexes — a non-trivial operation that would break existing data. This is a deliberate lock-in trade-off for operational stability.

```bash
docker compose up -d --build
```

---

### Option B — Local with Ollama (no chat API costs)

Ollama runs on your **host machine**, not inside Docker. Only `OPENAI_API_KEY` is needed (embeddings).

**RAM requirement:** ~16 GB for `qwen2.5:14b-instruct-q5_K_M`. Use `llama3.1:8b-instruct-q5_K_M` (~6 GB) on machines with less RAM — set `OLLAMA_CHAT_MODEL=llama3.1:8b-instruct-q5_K_M` in `.env`.

```bash
# 1. Install Ollama: https://ollama.com
ollama pull qwen2.5:14b-instruct-q5_K_M
ollama serve   # keep this running

# 2. In .env:
LLM_PROVIDER=ollama
OPENAI_API_KEY=sk-...   # still required for embeddings
# OLLAMA_BASE_URL defaults to http://host.docker.internal:11434/v1 (Mac/Windows)
# Linux: use http://172.17.0.1:11434/v1 or add --network host to the api service

# 3. Start the stack
docker compose up -d --build
```

**Switching providers** is a single env var change plus a service restart:
```bash
# Change LLM_PROVIDER in .env, then:
docker compose restart api
```

---

## Running

**First, verify all services are healthy:**

```bash
curl http://localhost:3000/health   # {"status":"ok","service":"api","version":"0.1.0"}
curl http://localhost:8000/health   # {"status":"ok","service":"ocr","version":"0.1.0"}
curl -I http://localhost:5173       # HTTP/1.1 200 OK  (nginx web UI)
```

**Open the web UI:**

```
http://localhost:5173
```

Upload a document with drag-and-drop or the file picker. The system ingests, generates a five-section draft, and displays inline citation badges. Click any section's **Edit** button to submit a correction — the system diffs, classifies, and stores the signal. Use **Re-generate draft** to produce Draft 2, then compare them side-by-side.

**Ingest a document:**

```bash
curl -F "file=@samples/inputs/01-clean-complaint.pdf" http://localhost:3000/ingest
# Returns: {"documentId":"<uuid>","chunkCount":N,"fields":{...},"ocrConfidence":1.0}
```

**Generate a five-section draft:**

```bash
curl -X POST http://localhost:3000/draft \
  -H "Content-Type: application/json" \
  -d '{"document_id":"<uuid>"}'
# Returns: {"documentId":"...","sections":{"parties":{...},...},"providerUsed":"ollama"}
```

**Capture an operator edit:**

```bash
curl -X POST http://localhost:3000/edit \
  -H "Content-Type: application/json" \
  -d '{"draft_id":"<draft-uuid>","section":"parties","edited_text":"Corrected text here [c:...] ..."}'
# Returns: {"editId":"...","classification":{...},"signalScore":0.9,"promotedToExemplar":true}
```

**Sample inputs and outputs** (pre-built for review):

```
samples/inputs/   — 7 PDFs: clean, scanned, image-only, and degraded variants
samples/outputs/  — walkthroughs, extracted fields, initial draft, improved draft, eval summary
```

See [`samples/outputs/README.md`](samples/outputs/README.md) for descriptions of each file.

**Run the full end-to-end demo** (ingest → draft → edit → re-draft → compare):

```bash
npm run demo
```

**Run evaluation:**

```bash
CONFIRM_RESET=1 npm run eval:full   # writes eval/results/run-NNN.md
```

### Testing

**Unit tests** (no external services required — runs in < 1s):

```bash
npm run test:unit
```

**Full test suite** (unit + OCR Python tests via Docker):

```bash
npm test
```

**Integration tests** (requires a throwaway Postgres database):

```bash
# Start a test DB (or use the dev DB — integration tests truncate tables):
export TEST_DATABASE_URL="postgres://legal:secret@localhost:5432/legalrag"
npm run test:integration
```

The integration test exercises the full ingest → draft → edit → re-draft flow against a real database with a mock LLM provider, verifying SQL correctness and route response shapes without API calls.

---

## API Reference

### `GET /documents`

Returns all ingested documents ordered by creation date (newest first). Used by the web UI sidebar.

**Response:** `[{"id": "uuid", "filename": "...", "document_type": "complaint", "created_at": "..."}]`

---

### `GET /documents/:id`

Returns full document detail including extracted structured fields.

**Response:** `{"id": "uuid", "filename": "...", "document_type": "complaint", "parties": {"plaintiffs": [...], "defendants": [...], "counsel": [...]}, "key_dates": [{"label": "...", "iso_date": "..."}], "ocr_confidence": 1.0, "created_at": "..."}`

---

### `POST /ingest`

Accepts `multipart/form-data` with a single `file` field (PDF, PNG, JPEG, TIFF; max 50 MB).
Runs OCR → field extraction → semantic chunking → embedding in sequence.

**Response:**
```json
{
  "documentId": "uuid",
  "chunkCount": 28,
  "fields": {
    "document_type": "complaint",
    "parties": {"plaintiffs": ["Jane Smith"], "defendants": ["Global Tech Inc."], "counsel": ["Morrison & Foerster LLP"]},
    "key_dates": [{"label": "filing date", "iso_date": "2024-02-20"}]
  },
  "ocrConfidence": 1.0
}
```

---

### `POST /draft`

**Body:** `{"document_id": "uuid"}`

Generates a five-section Case Fact Summary. Each section is retrieved and generated independently. Injects stored exemplars and style preferences from prior edits (empty on first run).

**Response:**
```json
{
  "documentId": "uuid",
  "sections": {
    "parties": {
      "draftId": "uuid",
      "content": "Plaintiff Jane Smith [c:abc-123] brings this action against...",
      "citations": [{"chunk_id": "abc-123", "snippet": "...", "score": 0.91}],
      "groundingScore": 0.84
    }
  },
  "providerUsed": "ollama"
}
```

---

### `POST /retrieve`

**Body:** `{"document_id": "uuid", "section": "parties" | "key_dates" | "issues" | "procedural_history" | "relief"}`

Returns ranked chunks for a section using hybrid vector + full-text retrieval with RRF.

**Response:** `{"section": "parties", "chunks": [{"id": "uuid", "text": "...", "score": 1.0, "snippet": "..."}]}`

---

### `POST /edit`

**Body:** `{"draft_id": "uuid", "section": "parties", "edited_text": "corrected text..."}`

Computes word-level diff, classifies the edit type, scores signal strength, persists the edit, and conditionally promotes to the exemplar pool.

**Response:**
```json
{
  "editId": "uuid",
  "classification": {"class": "factual_correction", "confidence": 0.92, "reasoning": "party name corrected"},
  "signalScore": 0.9,
  "promotedToExemplar": true
}
```

---

### `GET /draft/:id`

Returns a previously generated draft row. Useful for retrieving the content of a specific section for editing.

---

### `GET /draft/:id/citations`

Returns the citation evidence that backed a draft section — the exact source chunks cited.

**Response:** `{"draft_id": "uuid", "section": "parties", "citations": [{"chunk_id": "...", "snippet": "...", "score": 0.91}]}`

---

## Provider Architecture

The `LLMProvider` interface (`apps/api/src/llm/provider.ts`) defines two methods — `complete()` and `completeJSON<T>()` — implemented by three classes:

| Provider | Class | Key | Default model |
|----------|-------|-----|---------------|
| Anthropic | `AnthropicProvider` | `ANTHROPIC_API_KEY` | `claude-sonnet-4-6` |
| OpenAI | `OpenAIProvider` | `OPENAI_API_KEY` | `gpt-4o-mini` |
| Ollama | `OllamaProvider` | none | `qwen2.5:14b-instruct-q5_K_M` |

`getLLMProvider()` in `router.ts` returns a singleton for the configured provider, with a fallback chain (anthropic → openai → ollama) if credentials are absent. All generation logic in `pipeline/generate.ts` calls `provider.complete()` — there are no provider-specific branches outside the provider classes themselves.

**Embeddings are intentionally separate.** `apps/api/src/pipeline/embed.ts` calls OpenAI's embedding API directly and does not implement `LLMProvider`. This is a deliberate decision: routing embeddings through the same abstraction as chat would require all three provider backends to support the same embedding dimensions, defeating the purpose of the interface. The 1536-dimension schema commitment means the embedding provider is not swappable without a full data migration, so the abstraction would be misleading.

---

## Evaluation

Grounding precision — measured as the fraction of non-refusal sections whose full content embedding has cosine similarity ≥ 0.70 to its cited source chunk — reached 72.0% across three sample documents (run-003; clean PDFs plus two image-only OCR variants). Edit-loop convergence reduced operator word-level edit distance by 74.4% from iteration 1 to iteration 5 (168 → 43), well above the 30% threshold. See [EVALUATION.md](EVALUATION.md) for full methodology, assumptions, and reproduction instructions.

---

## Tradeoffs and Future Work

- **Refusal over fabrication**: The system is deliberately conservative — it refuses sections without grounding evidence rather than generating plausible-but-unsupported text. This may reduce surface "completeness" on partial-information documents (a court notice legitimately has no relief section) but eliminates confident hallucination, which is the most damaging RAG failure mode. Grounding precision metrics exclude these refusals from the denominator; a refusal is correct behavior, not a failure.
- **Embedding-provider lock-in**: OpenAI `text-embedding-3-small` at 1536 dims is committed at schema creation. Swapping providers requires re-embedding all chunks and rebuilding pgvector HNSW indexes. A proper migration path would be to add a `embedding_provider` column and run a background job, but this is out of scope.
- **Grounding proxy is cosine similarity, not NLI**: the verifier flags claims that are semantically close to their cited chunks. It does not detect logical entailment or factual contradiction. A DeBERTa-based NLI model would be more precise but would add a GPU dependency.
- **BM25 is approximate**: `ts_rank_cd` over a GIN `tsvector` index is not BM25 — it lacks IDF weighting and corpus statistics. A proper BM25 implementation (e.g., `pgroonga` or a dedicated search engine) would improve retrieval precision on legal terminology.
- **Edit classifier uses LLM inference**: classifying each edit via the chat provider adds latency and cost per edit. A fine-tuned BERT-class classifier trained on the accumulated `edits` table would be faster and cheaper, and would improve classification quality on domain-specific patterns.
- **No async ingestion queue**: large PDFs can make the `/ingest` endpoint slow (OCR + chunking + embedding). A proper production system would return a job ID and use a message queue (e.g., BullMQ) for background processing.
- **No auth or multi-tenancy**: all documents and drafts are globally visible. A production deployment would need at minimum an API key scheme and document-level ACLs.
- **Retrieval cap for Ollama (3k chars/section)**: the evidence block passed to each section prompt is capped at 3,000 characters to fit within smaller open models' effective context. Cloud providers could accept the full top-8 chunks without degradation; this cap is a cost-driven concession to Ollama compatibility, not a fundamental constraint.

---

## Troubleshooting

**`docker compose up` — OCR container keeps restarting**
```
# Check logs:
docker compose logs ocr
# Common cause: poppler not installed in image (required by pdf2image)
# Fix: ensure Dockerfile has: RUN apt-get install -y poppler-utils
```

**`OPENAI_API_KEY` validation error on API startup**
```bash
# API fails fast if key is missing. Ensure .env has:
OPENAI_API_KEY=sk-...
LLM_PROVIDER=openai   # or anthropic / ollama
```

**Ingestion timeout on large PDFs (OCR sidecar)**
```bash
# Default timeout is 120s. Increase in docker-compose.yml under api environment:
OCR_TIMEOUT_MS=300000
# Or use a smaller/pre-split PDF for testing.
```

**`/draft` returns empty sections or all refusals**
```bash
# Document may not have been ingested with chunks. Verify:
docker exec legal-rag-db-1 psql -U legal -d legalrag \
  -c "SELECT COUNT(*) FROM chunks WHERE document_id='<uuid>';"
# If 0 rows, re-ingest the document.
```

**Ollama: "model not found" on first draft generation**
```bash
# Pull the model on the host before starting the stack:
ollama pull qwen2.5:14b-instruct-q5_K_M
ollama serve
# Then docker compose up
```

**Web UI shows CORS error / blank sidebar**
```bash
# API must be running on port 3000. Check:
curl http://localhost:3000/health
# If down, restart: docker compose restart api
```

---

## Author

**Al Amin Ahamed**  
[alaminahamed.com](https://alaminahamed.com) · mrabir.ahamed@gmail.com · +880 1794 301713  
[linkedin.com/in/mralaminahamed](https://linkedin.com/in/mralaminahamed) · [github.com/mralaminahamed](https://github.com/mralaminahamed)
