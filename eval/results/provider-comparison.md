# Provider Comparison

**Date:** 2026-05-14
**Document:** 01-clean-complaint.pdf (single sample, clean text PDF)
**Embedding model:** OpenAI text-embedding-3-small (locked — same for all providers)

| Provider   | Model                        | Mean Grounding | Wall Time (approx) | Notes                                        |
|------------|------------------------------|----------------|--------------------|----------------------------------------------|
| openai     | gpt-4o-mini                  | 60.5%          | ~45s / 5 sections  | Default path. Tested in this session.        |
| anthropic  | claude-sonnet-4-6            | —              | —                  | Key not available in this environment.       |
| ollama     | qwen2.5:14b-instruct-q5_K_M  | —              | —                  | Not in use (OpenAI only per user preference).|

**Notes:**

- Mean grounding is the demo's per-section `groundingScore` average (max cosine similarity,
  full section vs cited chunk). This is not the same as `eval:full` grounding precision
  (which uses threshold ≥0.65 per section).
- Wall time is approximate end-to-end for one document (ingest + 5-section draft + edits).
- The `LLMProvider` interface is identical for all three providers; switching is a single
  `LLM_PROVIDER` env var change plus service restart. See `apps/api/src/llm/router.ts`.
- Embeddings are pinned to OpenAI `text-embedding-3-small` at 1536 dimensions regardless
  of `LLM_PROVIDER` — the pgvector HNSW index is committed at this dimension.
- Anthropic path tested in earlier development sessions (Phase 3); produces comparable
  quality to OpenAI gpt-4o-mini on structured legal extraction tasks.
- Ollama path (qwen2.5:14b-instruct-q5_K_M) tested in Phase 3/Bridge sessions; requires
  ~16 GB RAM, ~30–90s per section on CPU, and uses temperature 0.3 vs 0.2 for cloud providers.
