-- Lets a project own targets, and lets a project connect straight to an impact
-- as well as through an outcome (see product/domain-model/project.md).
-- Run against a database already built from create_db.sql and 001-024.

BEGIN;

-- A target belongs to exactly one parent: an outcome, an impact or a project.
ALTER TABLE targets ADD COLUMN IF NOT EXISTS project_id BIGINT REFERENCES projects(id);
ALTER TABLE targets DROP CONSTRAINT IF EXISTS targets_one_parent;
ALTER TABLE targets ADD CONSTRAINT targets_one_parent
    CHECK (num_nonnulls(outcome_id, impact_id, project_id) = 1);
CREATE INDEX IF NOT EXISTS idx_targets_project_id ON targets(project_id);

CREATE TABLE IF NOT EXISTS project_impacts (
    id         BIGSERIAL PRIMARY KEY,
    account_id BIGINT NOT NULL REFERENCES accounts(id),
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    impact_id  BIGINT NOT NULL REFERENCES impacts(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (project_id, impact_id)
);

CREATE INDEX IF NOT EXISTS idx_project_impacts_account_id ON project_impacts(account_id);
CREATE INDEX IF NOT EXISTS idx_project_impacts_project_id ON project_impacts(project_id);
CREATE INDEX IF NOT EXISTS idx_project_impacts_impact_id ON project_impacts(impact_id);

COMMIT;
