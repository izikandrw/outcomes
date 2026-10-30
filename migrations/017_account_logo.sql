-- Adds an optional logo to accounts, stored as a small image data URL like a
-- team's logo (see product/domain-model/account.md). The web app shows it in
-- the header, the account menu and on invite links.
-- Run against a database already built from create_db.sql and 001-016.

BEGIN;

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS logo TEXT;

COMMIT;
