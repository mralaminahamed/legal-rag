-- 001_init.sql
-- Initial schema for legal-rag: documents, chunks, drafts, edits, exemplars, style preferences. All statements idempotent (IF NOT EXISTS).

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS documents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filename        TEXT NOT NULL,
    document_type   TEXT,
    parties         JSONB,
    key_dates       JSONB,
    raw_text        TEXT NOT NULL,
    ocr_confidence  NUMERIC(5,2),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chunks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index     INT  NOT NULL,
    text            TEXT NOT NULL,
    page_number     INT,
    embedding       vector(768) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS chunks_doc_idx        ON chunks (document_id);
CREATE INDEX IF NOT EXISTS chunks_embedding_idx  ON chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS chunks_text_gin_idx   ON chunks USING gin (to_tsvector('english', text));

CREATE TABLE IF NOT EXISTS drafts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    section         TEXT NOT NULL,           -- 'parties' | 'key_dates' | ...
    content         TEXT NOT NULL,
    citations       JSONB NOT NULL,          -- [{chunk_id, snippet, score}]
    generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    iteration       INT  NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS edits (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    draft_id        UUID NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
    section         TEXT NOT NULL,
    original_text   TEXT NOT NULL,
    edited_text     TEXT NOT NULL,
    diff_ops        JSONB NOT NULL,          -- structured edit operations
    edit_class      TEXT,                    -- rephrase | factual | formatting | omission | addition
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS edit_exemplars (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section         TEXT NOT NULL,
    before_text     TEXT NOT NULL,
    after_text      TEXT NOT NULL,
    edit_class      TEXT NOT NULL,
    embedding       vector(768) NOT NULL,   -- embedded on `before_text`
    signal_score    NUMERIC(5,3) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS exemplars_section_idx    ON edit_exemplars (section);
CREATE INDEX IF NOT EXISTS exemplars_embedding_idx  ON edit_exemplars USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS style_preferences (
    section         TEXT PRIMARY KEY,
    preferences     JSONB NOT NULL,          -- accumulating preference profile
    edit_count      INT  NOT NULL DEFAULT 0,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
