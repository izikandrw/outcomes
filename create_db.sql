-- PostgreSQL schema: accounts (one) -> teams (one) -> outcomes (many) -> measurements (many)
-- All rows are segmented by account_id for multi-tenant isolation.

CREATE TABLE accounts (
    id          BIGSERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE teams (
    id             BIGSERIAL PRIMARY KEY,
    account_id     BIGINT NOT NULL REFERENCES accounts(id),
    parent_team_id BIGINT REFERENCES teams(id),
    name           TEXT NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_teams_account_id ON teams(account_id);
CREATE INDEX idx_teams_parent_team_id ON teams(parent_team_id);

CREATE TABLE projects (
    id          BIGSERIAL PRIMARY KEY,
    account_id  BIGINT NOT NULL REFERENCES accounts(id),
    team_id     BIGINT NOT NULL REFERENCES teams(id),
    name        TEXT NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_projects_account_id ON projects(account_id);
CREATE INDEX idx_projects_team_id ON projects(team_id);

CREATE TABLE outcomes (
    id                BIGSERIAL PRIMARY KEY,
    account_id        BIGINT NOT NULL REFERENCES accounts(id),
    team_id           BIGINT NOT NULL REFERENCES teams(id),
    project_id        BIGINT REFERENCES projects(id),
    parent_outcome_id BIGINT REFERENCES outcomes(id),
    name              TEXT NOT NULL,
    description       TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_outcomes_account_id ON outcomes(account_id);
CREATE INDEX idx_outcomes_team_id ON outcomes(team_id);
CREATE INDEX idx_outcomes_project_id ON outcomes(project_id);
CREATE INDEX idx_outcomes_parent_outcome_id ON outcomes(parent_outcome_id);

CREATE TABLE measurements (
    id          BIGSERIAL PRIMARY KEY,
    account_id  BIGINT NOT NULL REFERENCES accounts(id),
    outcome_id  BIGINT NOT NULL REFERENCES outcomes(id),
    value       DOUBLE PRECISION NOT NULL,
    unit        TEXT,
    measured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_measurements_account_id ON measurements(account_id);
CREATE INDEX idx_measurements_outcome_id ON measurements(outcome_id);
