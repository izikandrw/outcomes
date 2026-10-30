-- Whether an insight is good, bad or neutral news for the customer experience
-- it describes. Left NULL for insights recorded before this, rather than
-- guessing; a person or the collector sets it.
-- Run against a database already built from create_db.sql and 001-017.

BEGIN;

ALTER TABLE insights ADD COLUMN IF NOT EXISTS sentiment TEXT
    CHECK (sentiment IN ('positive', 'neutral', 'negative'));

COMMIT;
