-- Adds targets between outcomes and measurements, and repoints measurements at
-- them. A target is the outcome stated as numbers: unit, baseline, and the
-- value to reach. The unit moves off the reading and onto the target, so every
-- reading in one series is guaranteed to be counting the same thing.
-- Run against a database already built from create_db.sql, 001_project_links.sql
-- and 002_insights.sql.

BEGIN;

CREATE TABLE targets (
    id             BIGSERIAL PRIMARY KEY,
    account_id     BIGINT NOT NULL REFERENCES accounts(id),
    outcome_id     BIGINT NOT NULL REFERENCES outcomes(id),
    name           TEXT NOT NULL,
    description    TEXT,
    unit           TEXT NOT NULL,
    baseline_value DOUBLE PRECISION NOT NULL,
    target_value   DOUBLE PRECISION NOT NULL,
    baseline_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    due_at         TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_targets_account_id ON targets(account_id);
CREATE INDEX idx_targets_outcome_id ON targets(outcome_id);

-- Every outcome that already has readings gets one target to hold them, so the
-- column swap below orphans nothing. The baseline is that outcome's earliest
-- reading and the unit is whatever those readings already used.
--
-- target_value is seeded equal to the baseline. That reads as "nobody has said
-- how far this should move yet", which is true; inventing an ambition here
-- would be worse than leaving it visibly unset.
INSERT INTO targets (account_id, outcome_id, name, description, unit, baseline_value, target_value, baseline_at)
SELECT o.account_id,
       o.id,
       o.name,
       'Seeded by migration 003 to hold readings that used to hang off the outcome. Set a real target value.',
       COALESCE(earliest.unit, 'unknown'),
       earliest.value,
       earliest.value,
       earliest.measured_at
  FROM outcomes o
  JOIN LATERAL (
         SELECT m.value, m.unit, m.measured_at
           FROM measurements m
          WHERE m.outcome_id = o.id
          ORDER BY m.measured_at, m.id
          LIMIT 1
       ) earliest ON true;

ALTER TABLE measurements ADD COLUMN target_id BIGINT REFERENCES targets(id);

UPDATE measurements m
   SET target_id = t.id
  FROM targets t
 WHERE t.outcome_id = m.outcome_id;

ALTER TABLE measurements ALTER COLUMN target_id SET NOT NULL;

DROP INDEX IF EXISTS idx_measurements_outcome_id;
ALTER TABLE measurements DROP COLUMN outcome_id;
ALTER TABLE measurements DROP COLUMN unit;

CREATE INDEX idx_measurements_target_id ON measurements(target_id);

-- Say out loud which targets still need a real number on them.
DO $$
DECLARE seeded INT;
BEGIN
  SELECT count(*) INTO seeded FROM targets WHERE target_value = baseline_value;
  IF seeded > 0 THEN
    RAISE NOTICE '% target(s) seeded with target_value = baseline_value. Set real target values before reading progress.', seeded;
  END IF;
END $$;

COMMIT;
