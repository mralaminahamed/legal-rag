-- 002_exemplar_scope.sql
-- Adds is_generalizable flag and document_id to edit_exemplars.
-- Factual corrections (is_generalizable = false) are scoped to their source
-- document and never injected into unrelated document prompts.
-- Generalizable edits (rephrase, formatting, omission, addition) remain
-- globally retrievable across all documents.

ALTER TABLE edit_exemplars
  ADD COLUMN IF NOT EXISTS is_generalizable BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE edit_exemplars
  ADD COLUMN IF NOT EXISTS document_id UUID REFERENCES documents(id) ON DELETE CASCADE;

-- Partial index speeds up cross-document retrieval (the common path)
CREATE INDEX IF NOT EXISTS exemplars_generalizable_idx
  ON edit_exemplars (section)
  WHERE is_generalizable = true;
