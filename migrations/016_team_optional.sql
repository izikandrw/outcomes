-- Every outcome and project should end up with a team, but you often don't
-- know which team owns one when you first write it down, e.g. when the insight
-- collector proposes it. team_id becomes optional so it can be filled in
-- later; the issues page lists the ones still without a team.
-- Run against a database already built from create_db.sql and 001-015.

BEGIN;

ALTER TABLE outcomes ALTER COLUMN team_id DROP NOT NULL;
ALTER TABLE projects ALTER COLUMN team_id DROP NOT NULL;

COMMIT;
