-- Adds the type an insight is classified by and makes its team optional (see product/domain-model/insight.md).
-- Run against a database already built from create_db.sql and 001-005.

BEGIN;

ALTER TABLE insights ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'other'
    CHECK (type IN ('support_ticket', 'session_recording', 'interview', 'funnel', 'experiment', 'other'));

-- Insights no longer belong to a team (the team relationship was dropped from
-- the domain model), so team_id becomes optional rather than required. 019 later
-- dropped the column, and create_db.sql no longer has it, so it may not be there.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = current_schema() AND table_name = 'insights' AND column_name = 'team_id'
    ) THEN
        ALTER TABLE insights ALTER COLUMN team_id DROP NOT NULL;
    END IF;
END $$;

COMMIT;
