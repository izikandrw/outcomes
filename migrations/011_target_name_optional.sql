-- A target is owned by exactly one outcome or impact (see
-- product/domain-model/target.md) and is shown inside its owner, so a name is
-- optional: when blank, the unit labels it. An impact "Grow revenue" measured
-- as 1000 -> 1200 ARR no longer needs a second "Revenue growth" name for the
-- same thing.
-- Run against a database already built from create_db.sql and 001-010.

BEGIN;

ALTER TABLE targets ALTER COLUMN name DROP NOT NULL;

COMMIT;
