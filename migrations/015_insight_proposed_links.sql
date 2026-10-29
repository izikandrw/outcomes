-- Lets the insight collector propose an outcome or project that doesn't exist
-- yet, alongside (or instead of) links to ones that do. It never creates them:
-- a reviewer turns a proposal into a real outcome or project, which the
-- insight is then linked to, or dismisses it (see
-- product/agents/insight-collector/spec.md).
-- Each element: { "kind": "outcome" | "project", "name", "description", "rationale" }.
-- Run against a database already built from create_db.sql and 001-014.

BEGIN;

ALTER TABLE insights ADD COLUMN IF NOT EXISTS proposed_links JSONB NOT NULL DEFAULT '[]';

COMMIT;
