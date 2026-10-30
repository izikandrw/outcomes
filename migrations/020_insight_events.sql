-- Records everything that happens to an insight, with the insight as it was
-- before and after, so a reviewer's edits, removed links, dismissed proposals
-- and verdicts don't overwrite what the collector originally suggested. This is
-- the trace of each suggestion and the labelled data its evals are built from
-- (see product/agents/insight-collector/evals.md, "Closing the loop with
-- production").
-- Run against a database already built from create_db.sql and 001-019.

BEGIN;

-- before/after are snapshots in the shape src/lib/insightEvents.js writes:
-- the insight's fields plus outcome_ids, project_ids, link_rationales and
-- proposed_links. details holds what a snapshot can't, e.g. which proposal an
-- outcome adopted.
CREATE TABLE IF NOT EXISTS insight_events (
    id         BIGSERIAL PRIMARY KEY,
    account_id BIGINT NOT NULL REFERENCES accounts(id),
    insight_id BIGINT NOT NULL REFERENCES insights(id) ON DELETE CASCADE,
    action     TEXT NOT NULL
               CHECK (action IN ('created', 'edited', 'validated', 'rejected', 'reopened', 'proposal_adopted')),
    actor_id   BIGINT REFERENCES users(id) ON DELETE SET NULL,
    before     JSONB,
    after      JSONB,
    details    JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_insight_events_account_id ON insight_events(account_id);
CREATE INDEX IF NOT EXISTS idx_insight_events_insight_id ON insight_events(insight_id);

-- Backfill what can still be known about suggestions made before this. An
-- unedited suggestion still holds what the collector said, so its creation
-- snapshot is rebuilt from it (as waiting for review); an edited one's original
-- is lost, so it gets none. A reviewed one gets its verdict.
INSERT INTO insight_events (account_id, insight_id, action, actor_id, after, details, created_at)
SELECT i.account_id, i.id, 'created',
       (SELECT u.id FROM users u WHERE u.account_id = i.account_id AND u.role = 'collector' ORDER BY u.id LIMIT 1),
       jsonb_build_object(
         'name', i.name, 'type', i.type, 'description', i.description, 'source', i.source,
         'observed_at', i.observed_at, 'dollar_impact', i.dollar_impact, 'impact_area', i.impact_area,
         'sentiment', i.sentiment, 'status', 'unvalidated',
         'source_system', i.source_system, 'source_url', i.source_url,
         'source_external_id', i.source_external_id, 'source_excerpt', i.source_excerpt,
         'firsthand', i.firsthand, 'rejection_reason', NULL, 'review_note', NULL,
         'proposed_links', i.proposed_links,
         'outcome_ids', COALESCE((SELECT jsonb_agg(io.outcome_id::text ORDER BY io.outcome_id)
                                    FROM insight_outcomes io WHERE io.insight_id = i.id), '[]'),
         'project_ids', COALESCE((SELECT jsonb_agg(ip.project_id::text ORDER BY ip.project_id)
                                    FROM insight_projects ip WHERE ip.insight_id = i.id), '[]'),
         'link_rationales', jsonb_build_object(
           'outcomes', COALESCE((SELECT jsonb_object_agg(io.outcome_id, io.rationale) FROM insight_outcomes io
                                  WHERE io.insight_id = i.id AND io.rationale IS NOT NULL), '{}'),
           'projects', COALESCE((SELECT jsonb_object_agg(ip.project_id, ip.rationale) FROM insight_projects ip
                                  WHERE ip.insight_id = i.id AND ip.rationale IS NOT NULL), '{}'))
       ),
       '{"backfilled": true}', i.created_at
  FROM insights i
 WHERE i.collection_run_id IS NOT NULL AND NOT i.edited_in_review
   AND NOT EXISTS (SELECT 1 FROM insight_events e WHERE e.insight_id = i.id);

INSERT INTO insight_events (account_id, insight_id, action, actor_id, after, details, created_at)
SELECT i.account_id, i.id, i.status, i.reviewed_by,
       jsonb_build_object('status', i.status, 'rejection_reason', i.rejection_reason, 'review_note', i.review_note),
       '{"backfilled": true}', i.reviewed_at
  FROM insights i
 WHERE i.collection_run_id IS NOT NULL AND i.reviewed_at IS NOT NULL AND i.status IN ('validated', 'rejected')
   AND NOT EXISTS (SELECT 1 FROM insight_events e WHERE e.insight_id = i.id AND e.action <> 'created');

COMMIT;
