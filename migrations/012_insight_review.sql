-- Adds insight review status, provenance and collection runs, so the insight
-- collector agent can suggest insights that only count as evidence once a
-- person validates them (see product/domain-model/insight.md and
-- product/agents/insight-collector/design.md).
-- Run against a database already built from create_db.sql and 001-011.

BEGIN;

-- One run of the insight collector against one external source. stats holds
-- the counts and token usage the run reports (documents read, candidates,
-- drops, insights created, tokens).
CREATE TABLE IF NOT EXISTS collection_runs (
    id             BIGSERIAL PRIMARY KEY,
    account_id     BIGINT NOT NULL REFERENCES accounts(id),
    source_system  TEXT NOT NULL,
    source_config  JSONB NOT NULL DEFAULT '{}',
    cursor         JSONB,
    status         TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'succeeded', 'failed')),
    model          TEXT,
    prompt_version TEXT,
    stats          JSONB NOT NULL DEFAULT '{}',
    error          TEXT,
    started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_collection_runs_account_id ON collection_runs(account_id);

-- Everything recorded before now was entered by a person, so it is validated.
ALTER TABLE insights
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'validated'
        CHECK (status IN ('unvalidated', 'validated', 'rejected')),
    ADD COLUMN IF NOT EXISTS source_system      TEXT,
    ADD COLUMN IF NOT EXISTS source_url         TEXT,
    ADD COLUMN IF NOT EXISTS source_external_id TEXT,
    ADD COLUMN IF NOT EXISTS source_excerpt     TEXT,
    ADD COLUMN IF NOT EXISTS firsthand          BOOLEAN,
    ADD COLUMN IF NOT EXISTS collection_run_id  BIGINT REFERENCES collection_runs(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS edited_in_review   BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS reviewed_by        BIGINT REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS reviewed_at        TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS rejection_reason   TEXT
        CHECK (rejection_reason IN ('not_an_insight', 'inaccurate', 'wrong_link', 'duplicate', 'other')),
    ADD COLUMN IF NOT EXISTS review_note        TEXT;

CREATE INDEX IF NOT EXISTS idx_insights_account_status ON insights(account_id, status);

-- The same quote from the same source document is collected once, so re-running
-- the collector is safe and a rejected suggestion is never made again.
CREATE UNIQUE INDEX IF NOT EXISTS idx_insights_source_excerpt
    ON insights (account_id, source_system, source_external_id, md5(source_excerpt))
    WHERE source_system IS NOT NULL AND source_external_id IS NOT NULL AND source_excerpt IS NOT NULL;

-- Kinds of evidence the collector reads that didn't fit the existing types.
ALTER TABLE insights DROP CONSTRAINT IF EXISTS insights_type_check;
ALTER TABLE insights ADD CONSTRAINT insights_type_check CHECK (type IN (
    'support_ticket', 'session_recording', 'interview', 'funnel', 'experiment',
    'sales_call', 'feature_request', 'survey', 'review', 'other'));

-- Why the collector thinks an insight supports this outcome or project.
ALTER TABLE insight_outcomes ADD COLUMN IF NOT EXISTS rationale TEXT;
ALTER TABLE insight_projects ADD COLUMN IF NOT EXISTS rationale TEXT;

-- The collector signs in as its own user, which may only suggest insights.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'member', 'collector'));

COMMIT;
