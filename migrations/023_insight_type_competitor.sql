-- Adds the insight type for something a competitor has done or shipped (see
-- product/domain-model/insight.md).
-- Run against a database already built from create_db.sql and 001-022.

BEGIN;

ALTER TABLE insights DROP CONSTRAINT IF EXISTS insights_type_check;
ALTER TABLE insights ADD CONSTRAINT insights_type_check CHECK (type IN (
    'support_ticket', 'session_recording', 'interview', 'funnel', 'experiment',
    'sales_call', 'feature_request', 'survey', 'review', 'competitor', 'other'));

COMMIT;
