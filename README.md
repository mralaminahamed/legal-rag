# Legal Document RAG — Case Fact Summary Generation

> Retrieval-augmented generation for legal documents with grounded drafting and edit-loop improvement.

## Overview

<!-- TODO phase 6 -->

## Architecture

<!-- TODO phase 6 — see ARCHITECTURE.md -->

## Setup

```bash
git clone https://github.com/mralaminahamed/legal-rag.git
cd legal-rag
cp .env.example .env
```

Then choose your LLM path:

---

### Option A — Cloud (recommended for first run)

Requires an Anthropic **or** OpenAI key for chat, plus an OpenAI key for embeddings.

```bash
# In .env:
LLM_PROVIDER=anthropic        # or openai
ANTHROPIC_API_KEY=sk-ant-...  # required when LLM_PROVIDER=anthropic
OPENAI_API_KEY=sk-...         # always required for embeddings
```

```bash
docker compose up --build
```

---

### Option B — Local with Ollama (no chat API key needed)

Ollama runs on your **host machine**. Only `OPENAI_API_KEY` is needed for embeddings.

```bash
# 1. Install Ollama: https://ollama.com
ollama pull qwen2.5:14b-instruct-q5_K_M   # ~10 GB; use llama3.1:8b for <16 GB RAM
ollama serve

# 2. In .env:
LLM_PROVIDER=ollama
OPENAI_API_KEY=sk-...   # still required for embeddings
# OLLAMA_BASE_URL and OLLAMA_CHAT_MODEL have sane defaults — no change needed

# 3. Start the stack
docker compose up --build
```

The first build downloads base images and installs dependencies — expect 3–5 minutes.
Subsequent starts are faster once layers are cached.

## Running

After `docker compose up --build` succeeds:

| Service | URL | Purpose |
|---------|-----|---------|
| API     | http://localhost:3000 | Primary REST API |
| OCR sidecar | http://localhost:8000 | PDF/image extraction |
| Postgres | localhost:5432 | Vector store + relational data |

**Verify services are healthy:**

```bash
curl http://localhost:3000/health
# {"status":"ok","service":"api","version":"0.1.0"}

curl http://localhost:8000/health
# {"status":"ok","service":"ocr","version":"0.1.0"}

psql $DATABASE_URL -c "\dt"
# Lists: documents, chunks, drafts, edits, edit_exemplars, style_preferences
```

**Stop all services:**

```bash
docker compose down
# To also remove the database volume: docker compose down -v
```

## API Reference

<!-- TODO phase 6 -->

## Evaluation

<!-- TODO phase 6 — see EVALUATION.md -->

## Tradeoffs and Future Work

<!-- TODO phase 6 -->

## Author

**Al Amin Ahamed** — [alaminahamed.com](https://alaminahamed.com)  
mrabir.ahamed@gmail.com · +880 1794 301713  
[linkedin.com/in/mralaminahamed](https://linkedin.com/in/mralaminahamed)
