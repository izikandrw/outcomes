-- PostgreSQL schema: accounts (one) -> teams (one) -> outcomes (many) ->
-- targets (many) -> measurements (many)
-- Outcomes and projects name their team once it's known (team_id is optional).
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
    logo           TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_teams_account_id ON teams(account_id);
CREATE INDEX idx_teams_parent_team_id ON teams(parent_team_id);

CREATE TABLE projects (
    id                BIGSERIAL PRIMARY KEY,
    account_id        BIGINT NOT NULL REFERENCES accounts(id),
    team_id           BIGINT REFERENCES teams(id),
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

-- An impact is the business result we wish to make. Impacts nest, and a
-- top-level outcome may link to one (outcomes.impact_id).
CREATE TABLE impacts (
    id               BIGSERIAL PRIMARY KEY,
    account_id       BIGINT NOT NULL REFERENCES accounts(id),
    parent_impact_id BIGINT REFERENCES impacts(id),
    name             TEXT NOT NULL,
    description      TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_impacts_account_id ON impacts(account_id);
CREATE INDEX idx_impacts_parent_impact_id ON impacts(parent_impact_id);

CREATE TABLE outcomes (
    id                BIGSERIAL PRIMARY KEY,
    account_id        BIGINT NOT NULL REFERENCES accounts(id),
    team_id           BIGINT REFERENCES teams(id),
    project_id        BIGINT REFERENCES projects(id),
    parent_outcome_id BIGINT REFERENCES outcomes(id),
    impact_id         BIGINT REFERENCES impacts(id),
    name              TEXT NOT NULL,
    description       TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_outcomes_account_id ON outcomes(account_id);
CREATE INDEX idx_outcomes_team_id ON outcomes(team_id);
CREATE INDEX idx_outcomes_project_id ON outcomes(project_id);
CREATE INDEX idx_outcomes_parent_outcome_id ON outcomes(parent_outcome_id);
CREATE INDEX idx_outcomes_impact_id ON outcomes(impact_id);

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

-- One run of the insight collector agent against one external source. stats
-- holds the counts and token usage the run reports.
CREATE TABLE collection_runs (
    id             BIGSERIAL PRIMARY KEY,
    account_id     BIGINT NOT NULL REFERENCES accounts(id),
    source_system  TEXT NOT NULL,
    source_config  JSONB NOT NULL DEFAULT '{}',
    cursor         JSONB,
    status         TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'succeeded', 'failed')),
    model          TEXT,
    prompt_version TEXT,
    stats          JSONB NOT NULL DEFAULT '{}',
    summary        TEXT, -- the collector's own account of the run
    error          TEXT,
    started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at    TIMESTAMPTZ
);

CREATE INDEX idx_collection_runs_account_id ON collection_runs(account_id);

-- What the collector did with each document a run read: the text it judged,
-- its decision and why, and the insights it suggested from it.
CREATE TABLE collection_run_documents (
    id          BIGSERIAL PRIMARY KEY,
    account_id  BIGINT NOT NULL REFERENCES accounts(id),
    run_id      BIGINT NOT NULL REFERENCES collection_runs(id) ON DELETE CASCADE,
    external_id TEXT NOT NULL,
    title       TEXT,
    text        TEXT NOT NULL,
    decision    TEXT NOT NULL CHECK (decision IN ('suggested', 'no_insight', 'already_collected')),
    reason      TEXT,
    insight_ids BIGINT[] NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_collection_run_documents_account_id ON collection_run_documents(account_id);
CREATE INDEX idx_collection_run_documents_run_id ON collection_run_documents(run_id);

-- An insight is a single sourced observation. team_id is optional: the team
-- that recorded it, if any. Any outcome or project may link to it. Only a
-- validated insight counts as evidence; the collector's suggestions start
-- unvalidated and carry where they came from (source_*).
CREATE TABLE insights (
    id          BIGSERIAL PRIMARY KEY,
    account_id  BIGINT NOT NULL REFERENCES accounts(id),
    team_id     BIGINT REFERENCES teams(id),
    name        TEXT NOT NULL,
    type        TEXT NOT NULL DEFAULT 'other'
                CHECK (type IN ('support_ticket', 'session_recording', 'interview', 'funnel', 'experiment',
                                'sales_call', 'feature_request', 'survey', 'review', 'other')),
    description TEXT,
    source      TEXT,
    observed_at TIMESTAMPTZ,
    dollar_impact NUMERIC(14, 2),
    impact_area TEXT
                CHECK (impact_area IN ('acquisition', 'activation', 'retention', 'expansion', 'cost', 'other')),
    status      TEXT NOT NULL DEFAULT 'validated'
                CHECK (status IN ('unvalidated', 'validated', 'rejected')),
    source_system      TEXT,
    source_url         TEXT,
    source_external_id TEXT,
    source_excerpt     TEXT,
    firsthand          BOOLEAN,
    collection_run_id  BIGINT REFERENCES collection_runs(id) ON DELETE SET NULL,
    edited_in_review   BOOLEAN NOT NULL DEFAULT false,
    reviewed_by        BIGINT, -- references users(id); added below, once users exists
    reviewed_at        TIMESTAMPTZ,
    rejection_reason   TEXT
                CHECK (rejection_reason IN ('not_an_insight', 'inaccurate', 'wrong_link', 'duplicate', 'other')),
    review_note        TEXT,
    -- Outcomes or projects the collector thinks are missing: [{ kind, name, description, rationale }].
    proposed_links     JSONB NOT NULL DEFAULT '[]',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_insights_account_id ON insights(account_id);
CREATE INDEX idx_insights_team_id ON insights(team_id);
CREATE INDEX idx_insights_account_status ON insights(account_id, status);

-- The same quote from the same source document is collected once.
CREATE UNIQUE INDEX idx_insights_source_excerpt
    ON insights (account_id, source_system, source_external_id, md5(source_excerpt))
    WHERE source_system IS NOT NULL AND source_external_id IS NOT NULL AND source_excerpt IS NOT NULL;

-- Many-to-many: one insight can justify several outcomes, and one outcome can
-- rest on several insights.
CREATE TABLE insight_outcomes (
    id         BIGSERIAL PRIMARY KEY,
    account_id BIGINT NOT NULL REFERENCES accounts(id),
    insight_id BIGINT NOT NULL REFERENCES insights(id) ON DELETE CASCADE,
    outcome_id BIGINT NOT NULL REFERENCES outcomes(id) ON DELETE CASCADE,
    rationale  TEXT, -- why the collector thinks the insight supports it
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
    rationale  TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (insight_id, project_id)
);

CREATE INDEX idx_insight_projects_account_id ON insight_projects(account_id);
CREATE INDEX idx_insight_projects_insight_id ON insight_projects(insight_id);
CREATE INDEX idx_insight_projects_project_id ON insight_projects(project_id);

-- A target is an outcome or an impact stated as numbers: the unit being
-- counted, the baseline it starts from, and the value it has to reach. It is
-- owned by exactly one of them, which can carry several, because a result that
-- moves exactly one number is rare. The name is optional; the unit labels a
-- target that has none.
-- No ON DELETE CASCADE: deleting an outcome or impact that still has targets is
-- refused, the same way the rest of the real entities behave.
CREATE TABLE targets (
    id             BIGSERIAL PRIMARY KEY,
    account_id     BIGINT NOT NULL REFERENCES accounts(id),
    outcome_id     BIGINT REFERENCES outcomes(id),
    impact_id      BIGINT REFERENCES impacts(id),
    name           TEXT,
    description    TEXT,
    unit           TEXT NOT NULL,
    baseline_value DOUBLE PRECISION NOT NULL,
    target_value   DOUBLE PRECISION NOT NULL,
    -- When the baseline was read. Distinct from created_at, which is when the
    -- row was typed in; a team often backdates the baseline to a real reading.
    baseline_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    due_at         TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- A target belongs to exactly one parent: an outcome or an impact.
    CONSTRAINT targets_one_parent CHECK ((outcome_id IS NULL) <> (impact_id IS NULL))
);

CREATE INDEX idx_targets_account_id ON targets(account_id);
CREATE INDEX idx_targets_outcome_id ON targets(outcome_id);
CREATE INDEX idx_targets_impact_id ON targets(impact_id);

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
    -- collector: the insight collector agent, which may only suggest insights.
    role          TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member', 'collector')),
    -- Sessions started before this are rejected, so a reset signs the user out everywhere.
    password_changed_at TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_users_email ON users (lower(email));
CREATE INDEX idx_users_account_id ON users(account_id);

ALTER TABLE insights ADD FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL;

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

-- An admin-generated, single-use link to choose a new password; only a hash of
-- the token is stored.
CREATE TABLE password_resets (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT NOT NULL UNIQUE,
    created_by  BIGINT REFERENCES users(id) ON DELETE SET NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_invites_account_id ON invites(account_id);
CREATE INDEX idx_password_resets_user_id ON password_resets(user_id);
