-- Adds impacts (see product/domain-model/impact.md): the business result we wish
-- to make. Impacts nest, top-level outcomes link to one, and a target can belong
-- to an impact instead of an outcome so the result itself can be measured.
-- Run against a database already built from create_db.sql and 001-009.

BEGIN;

CREATE TABLE IF NOT EXISTS impacts (
    id               BIGSERIAL PRIMARY KEY,
    account_id       BIGINT NOT NULL REFERENCES accounts(id),
    parent_impact_id BIGINT REFERENCES impacts(id),
    name             TEXT NOT NULL,
    description      TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_impacts_account_id ON impacts(account_id);
CREATE INDEX IF NOT EXISTS idx_impacts_parent_impact_id ON impacts(parent_impact_id);

-- Only top-level outcomes carry the link (enforced in the API); children inherit
-- their impact from their top-level ancestor.
ALTER TABLE outcomes ADD COLUMN IF NOT EXISTS impact_id BIGINT REFERENCES impacts(id);
CREATE INDEX IF NOT EXISTS idx_outcomes_impact_id ON outcomes(impact_id);

-- A target belongs to exactly one parent: an outcome or an impact, never both.
ALTER TABLE targets ALTER COLUMN outcome_id DROP NOT NULL;
ALTER TABLE targets ADD COLUMN IF NOT EXISTS impact_id BIGINT REFERENCES impacts(id);
ALTER TABLE targets DROP CONSTRAINT IF EXISTS targets_one_parent;
ALTER TABLE targets ADD CONSTRAINT targets_one_parent
    CHECK ((outcome_id IS NULL) <> (impact_id IS NULL));
CREATE INDEX IF NOT EXISTS idx_targets_impact_id ON targets(impact_id);

COMMIT;
