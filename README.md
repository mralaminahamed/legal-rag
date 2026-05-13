# Legal Document RAG — Case Fact Summary Generation

> Retrieval-augmented generation for legal documents with grounded drafting and edit-loop improvement.

## Overview

<!-- TODO phase 6 -->

## Architecture

<!-- TODO phase 6 — see ARCHITECTURE.md -->

## Setup

**Prerequisites:** Docker Desktop, an Anthropic API key, an OpenAI API key.

```bash
# 1. Clone the repository
git clone https://github.com/mralaminahamed/legal-rag.git
cd legal-rag

# 2. Copy environment template and fill in your API keys
cp .env.example .env
# Edit .env — set ANTHROPIC_API_KEY and OPENAI_API_KEY at minimum

# 3. Start all services
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
