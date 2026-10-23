-- Adds the area of the business an insight's impact lands on (see product/domain-model/insight.md).
-- Run against a database already built from create_db.sql and 001-007.

BEGIN;

ALTER TABLE insights ADD COLUMN IF NOT EXISTS impact_area TEXT
    CHECK (impact_area IN ('acquisition', 'activation', 'retention', 'expansion', 'cost', 'other'));

COMMIT;
