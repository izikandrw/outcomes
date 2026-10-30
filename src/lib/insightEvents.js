// Every change to an insight is recorded in insight_events with the insight as
// it was before and after, so what the collector originally suggested survives
// a reviewer's edits. The difference between the two is what the collector got
// wrong: the trace of a suggestion, and the labels its evals are built from
// (product/agents/insight-collector/evals.md, "Closing the loop with production").

const FIELDS = [
  'name', 'type', 'description', 'source', 'observed_at', 'dollar_impact', 'impact_area', 'sentiment', 'status',
  'source_system', 'source_url', 'source_external_id', 'source_excerpt', 'firsthand', 'rejection_reason',
  'review_note', 'proposed_links', 'link_rationales',
];

// The parts of an insight row (as the insights router reads it) a reviewer can
// change. Ids are strings and amounts numbers, however the driver returned them.
function snapshotOf(row) {
  if (!row) return null;
  const snapshot = Object.fromEntries(FIELDS.map((field) => [field, row[field] ?? null]));
  if (snapshot.dollar_impact !== null) snapshot.dollar_impact = Number(snapshot.dollar_impact);
  snapshot.outcome_ids = (row.outcome_ids ?? []).map(String);
  snapshot.project_ids = (row.project_ids ?? []).map(String);
  return snapshot;
}

async function recordEvent(executor, { accountId, insightId, action, actorId, before = null, after = null, details = {} }) {
  await executor.query(
    `INSERT INTO insight_events (account_id, insight_id, action, actor_id, before, after, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [accountId, insightId, action, actorId ?? null, before && JSON.stringify(before), after && JSON.stringify(after), JSON.stringify(details)]
  );
}

// Events with who made them, oldest first, for the insights given.
async function listEvents(executor, accountId, insightIds) {
  if (insightIds.length === 0) return [];
  const { rows } = await executor.query(
    `SELECT e.id, e.insight_id, e.action, e.before, e.after, e.details, e.created_at,
            e.actor_id, u.email AS actor_email, u.role AS actor_role
       FROM insight_events e LEFT JOIN users u ON u.id = e.actor_id
      WHERE e.account_id = $1 AND e.insight_id = ANY($2::bigint[])
      ORDER BY e.insight_id, e.created_at, e.id`,
    [accountId, insightIds]
  );
  return rows;
}

module.exports = { snapshotOf, recordEvent, listEvents };
