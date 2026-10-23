-- Adds the dollar impact an insight is estimated to represent (see product/domain-model/insight.md).
-- Run against a database already built from create_db.sql and 001-006.

BEGIN;

ALTER TABLE insights ADD COLUMN IF NOT EXISTS dollar_impact NUMERIC(14, 2);

COMMIT;
