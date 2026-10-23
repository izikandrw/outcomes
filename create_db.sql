-- PostgreSQL schema: accounts (one) -> teams (one) -> outcomes (many) ->
-- targets (many) -> measurements (many)
-- Projects hang off a team, may nest under a parent project, and link to any
-- number of outcomes through project_outcomes.
-- Insights optionally name a team and link to any number of outcomes and projects
-- through insight_outcomes and insight_projects.
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
    id                BIGSERIAL PRIMARY KEY,
    account_id        BIGINT NOT NULL REFERENCES accounts(id),
    team_id           BIGINT NOT NULL REFERENCES teams(id),
    parent_project_id BIGINT REFERENCES projects(id),
    name              TEXT NOT NULL,
    description       TEXT,
    -- When the work starts and when it ends; the roadmap is sequenced by these.
    start_at          TIMESTAMPTZ,
    end_at            TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_projects_account_id ON projects(account_id);
CREATE INDEX idx_projects_team_id ON projects(team_id);
CREATE INDEX idx_projects_parent_project_id ON projects(parent_project_id);

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

-- Many-to-many: a project can support several outcomes, and an outcome can be
-- supported by several projects. Separate from outcomes.project_id, which stays
-- the outcome's single home project.
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

-- An insight is a single sourced observation. team_id is optional: the team
-- that recorded it, if any. Any outcome or project may link to it.
CREATE TABLE insights (
    id          BIGSERIAL PRIMARY KEY,
    account_id  BIGINT NOT NULL REFERENCES accounts(id),
    team_id     BIGINT REFERENCES teams(id),
    name        TEXT NOT NULL,
    type        TEXT NOT NULL DEFAULT 'other'
                CHECK (type IN ('support_ticket', 'session_recording', 'interview', 'funnel', 'experiment', 'other')),
    description TEXT,
    source      TEXT,
    observed_at TIMESTAMPTZ,
    dollar_impact NUMERIC(14, 2),
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

-- A target is one outcome stated as numbers: the unit being counted, the
-- baseline it starts from, and the value it has to reach. An outcome can carry
-- several, because a behavior change that moves exactly one number is rare.
-- No ON DELETE CASCADE: deleting an outcome that still has targets is refused,
-- the same way the rest of the real entities behave.
CREATE TABLE targets (
    id             BIGSERIAL PRIMARY KEY,
    account_id     BIGINT NOT NULL REFERENCES accounts(id),
    outcome_id     BIGINT NOT NULL REFERENCES outcomes(id),
    name           TEXT NOT NULL,
    description    TEXT,
    unit           TEXT NOT NULL,
    baseline_value DOUBLE PRECISION NOT NULL,
    target_value   DOUBLE PRECISION NOT NULL,
    -- When the baseline was read. Distinct from created_at, which is when the
    -- row was typed in; a team often backdates the baseline to a real reading.
    baseline_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    due_at         TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_targets_account_id ON targets(account_id);
CREATE INDEX idx_targets_outcome_id ON targets(outcome_id);

-- Readings hang off a target, not an outcome. The unit lives on the target, so
-- every reading in one series is guaranteed to be counting the same thing.
CREATE TABLE measurements (
    id          BIGSERIAL PRIMARY KEY,
    account_id  BIGINT NOT NULL REFERENCES accounts(id),
    target_id   BIGINT NOT NULL REFERENCES targets(id),
    value       DOUBLE PRECISION NOT NULL,
    measured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_measurements_account_id ON measurements(account_id);
CREATE INDEX idx_measurements_target_id ON measurements(target_id);


CREATE TABLE users (
    id            BIGSERIAL PRIMARY KEY,
    account_id    BIGINT NOT NULL REFERENCES accounts(id),
    email         TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_users_email ON users (lower(email));
CREATE INDEX idx_users_account_id ON users(account_id);

CREATE TABLE invites (
    id          BIGSERIAL PRIMARY KEY,
    account_id  BIGINT NOT NULL REFERENCES accounts(id),
    email       TEXT NOT NULL,
    role        TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    token_hash  TEXT NOT NULL UNIQUE,
    invited_by  BIGINT REFERENCES users(id),
    expires_at  TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_invites_account_id ON invites(account_id);
