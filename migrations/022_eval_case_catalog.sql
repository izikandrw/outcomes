-- Freezes, with each eval case, the outcomes and projects it was labelled
-- against. A case's expected links name catalog ids, and the eval runner gives
-- the link step this same catalog, so deleting, merging or adding outcomes
-- later can't move a case's score: only the model and the prompt can (see
-- product/agents/insight-collector/evals.md).
-- Run against a database already built from create_db.sql and 001-021.

BEGIN;

-- { outcomes: [{ id, name, description }], projects: [...] }, ids as text.
ALTER TABLE eval_cases ADD COLUMN IF NOT EXISTS catalog JSONB;

-- Cases from before this get the account's catalog as it is now: the closest
-- there is to what they were labelled against.
UPDATE eval_cases c SET catalog = jsonb_build_object(
    'outcomes', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', o.id::text, 'name', o.name, 'description', o.description) ORDER BY o.id)
                            FROM outcomes o WHERE o.account_id = c.account_id), '[]'),
    'projects', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', p.id::text, 'name', p.name, 'description', p.description) ORDER BY p.id)
                            FROM projects p WHERE p.account_id = c.account_id), '[]'))
 WHERE c.catalog IS NULL;

ALTER TABLE eval_cases ALTER COLUMN catalog SET NOT NULL;

COMMIT;
