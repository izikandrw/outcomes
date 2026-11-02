-- Adds the insight type for a piece an organization or author published on
-- purpose, such as a blog post, research paper or postmortem (see
-- product/domain-model/insight.md).
-- Run against a database already built from create_db.sql and 001-023.

BEGIN;

ALTER TABLE insights DROP CONSTRAINT IF EXISTS insights_type_check;
ALTER TABLE insights ADD CONSTRAINT insights_type_check CHECK (type IN (
    'support_ticket', 'session_recording', 'interview', 'funnel', 'experiment',
    'sales_call', 'feature_request', 'survey', 'review', 'competitor', 'published_report', 'other'));

COMMIT;
