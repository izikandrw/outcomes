-- Adds users and invites. A user belongs to exactly one account and signs in
-- with email + password. Admins invite further users by generating a
-- single-use invite link; only a hash of the invite token is stored.
-- Run against a database already built from create_db.sql and 001-003.
-- Existing accounts have no users; sign up with a new account, or insert an
-- admin user for an existing one by hand.

BEGIN;

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

COMMIT;
