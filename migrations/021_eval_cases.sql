-- The insight collector's eval set: documents with the answer the collector
-- should give for each, which an eval runner scores a model or prompt version
-- against (see product/agents/insight-collector/evals.md). Kept here rather
-- than only in agent-insight-collector/evals/cases/ because cases hold customer content: this is
-- backed up and scoped by account like the rest of it, and a case can be added
-- straight from a run trace.
-- Run against a database already built from create_db.sql and 001-020.

BEGIN;

-- document and expected are an eval case's document.json and expected.json
-- (agent-insight-collector/evals/LABELING.md). label_source says where expected came from:
-- 'golden' was labelled by hand from the document alone, 'review' was drafted
-- from what reviewers did with the collector's suggestions. Only 'ready' cases
-- are scored; 'test' cases are the held-out split.
CREATE TABLE IF NOT EXISTS eval_cases (
    id              BIGSERIAL PRIMARY KEY,
    account_id      BIGINT NOT NULL REFERENCES accounts(id),
    name            TEXT NOT NULL,
    label_source    TEXT NOT NULL CHECK (label_source IN ('golden', 'review')),
    status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready')),
    split           TEXT NOT NULL DEFAULT 'dev' CHECK (split IN ('dev', 'test')),
    document        JSONB NOT NULL,
    expected        JSONB NOT NULL DEFAULT '{"insights": []}',
    run_document_id BIGINT REFERENCES collection_run_documents(id) ON DELETE SET NULL,
    created_by      BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (account_id, name)
);

CREATE INDEX IF NOT EXISTS idx_eval_cases_account_id ON eval_cases(account_id);

-- A run's document goes into each set at most once.
CREATE UNIQUE INDEX IF NOT EXISTS idx_eval_cases_run_document
    ON eval_cases (run_document_id, label_source) WHERE run_document_id IS NOT NULL;

COMMIT;
