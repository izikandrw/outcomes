-- Adds an optional logo to teams, stored as a small image data URL (see product/domain-model/team.md).
-- Run against a database already built from create_db.sql and 001-008.

BEGIN;

ALTER TABLE teams ADD COLUMN IF NOT EXISTS logo TEXT;

COMMIT;
