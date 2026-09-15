-- Adds project nesting (parent_project_id) and project <-> outcome links.
-- Run against a database already built from the original create_db.sql.

BEGIN;

ALTER TABLE projects ADD COLUMN parent_project_id BIGINT REFERENCES projects(id);

CREATE INDEX idx_projects_parent_project_id ON projects(parent_project_id);

CREATE TABLE project_outcomes (
    id         BIGSERIAL PRIMARY KEY,
    account_id BIGINT NOT NULL REFERENCES accounts(id),
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    outcome_id BIGINT NOT NULL REFERENCES outcomes(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (project_id, outcome_id)
);

CREATE INDEX idx_project_outcomes_account_id ON project_outcomes(account_id);
CREATE INDEX idx_project_outcomes_project_id ON project_outcomes(project_id);
CREATE INDEX idx_project_outcomes_outcome_id ON project_outcomes(outcome_id);

-- Seed the join table from the existing one-project-per-outcome column so
-- links that were already implied keep showing up.
INSERT INTO project_outcomes (account_id, project_id, outcome_id)
SELECT account_id, project_id, id FROM outcomes WHERE project_id IS NOT NULL
ON CONFLICT DO NOTHING;

COMMIT;
