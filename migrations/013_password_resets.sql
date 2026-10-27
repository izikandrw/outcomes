-- Adds password resets. An admin generates a single-use reset link for a user
-- in their account and shares it, the same way invites work; only a hash of
-- the reset token is stored. Resetting a password signs the user out of every
-- session started before the reset (users.password_changed_at).
-- Run against a database already built from create_db.sql and 001-012.

BEGIN;

ALTER TABLE users ADD COLUMN password_changed_at TIMESTAMPTZ;

CREATE TABLE password_resets (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT NOT NULL UNIQUE,
    created_by  BIGINT REFERENCES users(id) ON DELETE SET NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_password_resets_user_id ON password_resets(user_id);

COMMIT;
