-- Insights no longer have a team: an insight is evidence for the whole
-- account, and the teams it matters to are the ones owning the outcomes and
-- projects it supports (see product/domain-model/insight.md). Nothing reads
-- team_id any more, so it goes, along with its index. Any team already set on
-- an insight is discarded.
-- Run against a database already built from create_db.sql and 001-018.

BEGIN;

DROP INDEX IF EXISTS idx_insights_team_id;
ALTER TABLE insights DROP COLUMN IF EXISTS team_id;

COMMIT;
