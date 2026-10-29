-- Records what the insight collector did with every document it read in a run,
-- not just the insights it suggested, so a person can see what it skipped and
-- why, and pick eval cases from it (see
-- product/agents/insight-collector/design.md, "Run traces").
-- Run against a database already built from create_db.sql and 001-013.

BEGIN;

-- The collector's own account of the run, written when it finishes.
ALTER TABLE collection_runs ADD COLUMN IF NOT EXISTS summary TEXT;

-- One row per document the run read. text is the content the agent judged, so
-- the document can be re-run or turned into an eval case; insight_ids are the
-- suggestions it made from it.
CREATE TABLE IF NOT EXISTS collection_run_documents (
    id          BIGSERIAL PRIMARY KEY,
    account_id  BIGINT NOT NULL REFERENCES accounts(id),
    run_id      BIGINT NOT NULL REFERENCES collection_runs(id) ON DELETE CASCADE,
    external_id TEXT NOT NULL,
    title       TEXT,
    text        TEXT NOT NULL,
    decision    TEXT NOT NULL CHECK (decision IN ('suggested', 'no_insight', 'already_collected')),
    reason      TEXT,
    insight_ids BIGINT[] NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_collection_run_documents_account_id ON collection_run_documents(account_id);
CREATE INDEX IF NOT EXISTS idx_collection_run_documents_run_id ON collection_run_documents(run_id);

COMMIT;
