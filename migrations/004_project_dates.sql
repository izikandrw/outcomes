-- Adds a start and end date to projects so the roadmap can sequence outputs.
-- Run against a database already built from create_db.sql and 001-003.

BEGIN;

ALTER TABLE projects ADD COLUMN start_at TIMESTAMPTZ;
ALTER TABLE projects ADD COLUMN end_at TIMESTAMPTZ;

COMMIT;
