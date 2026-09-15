-- Adds insights and their links to outcomes and projects.
-- Run against a database already built from create_db.sql and 001_project_links.sql.

BEGIN;

-- An insight is a single sourced observation. team_id is the team that
-- recorded it; any team's outcomes and projects may still link to it.
CREATE TABLE insights (
    id          BIGSERIAL PRIMARY KEY,
    account_id  BIGINT NOT NULL REFERENCES accounts(id),
    team_id     BIGINT NOT NULL REFERENCES teams(id),
    name        TEXT NOT NULL,
    description TEXT,
    source      TEXT,
    observed_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_insights_account_id ON insights(account_id);
CREATE INDEX idx_insights_team_id ON insights(team_id);

-- Many-to-many: one insight can justify several outcomes, and one outcome can
-- rest on several insights.
CREATE TABLE insight_outcomes (
    id         BIGSERIAL PRIMARY KEY,
    account_id BIGINT NOT NULL REFERENCES accounts(id),
    insight_id BIGINT NOT NULL REFERENCES insights(id) ON DELETE CASCADE,
    outcome_id BIGINT NOT NULL REFERENCES outcomes(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (insight_id, outcome_id)
);

CREATE INDEX idx_insight_outcomes_account_id ON insight_outcomes(account_id);
CREATE INDEX idx_insight_outcomes_insight_id ON insight_outcomes(insight_id);
CREATE INDEX idx_insight_outcomes_outcome_id ON insight_outcomes(outcome_id);

-- Same shape for the evidence that a project should be built.
CREATE TABLE insight_projects (
    id         BIGSERIAL PRIMARY KEY,
    account_id BIGINT NOT NULL REFERENCES accounts(id),
    insight_id BIGINT NOT NULL REFERENCES insights(id) ON DELETE CASCADE,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (insight_id, project_id)
);

CREATE INDEX idx_insight_projects_account_id ON insight_projects(account_id);
CREATE INDEX idx_insight_projects_insight_id ON insight_projects(insight_id);
CREATE INDEX idx_insight_projects_project_id ON insight_projects(project_id);

COMMIT;
