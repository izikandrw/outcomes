const pool = require('../db');

// Confirms `id` exists in `table` and belongs to `accountId`.
// Used to stop a request from linking a row to a parent from a different account.
async function belongsToAccount(table, id, accountId) {
  const { rows } = await pool.query(`SELECT id FROM ${table} WHERE id = $1 AND account_id = $2`, [id, accountId]);
  return rows.length > 0;
}

// Same check for a list of ids, in one round trip. Returns the ids that are
// missing from the account, so the caller can name them in the error.
async function missingFromAccount(table, ids, accountId) {
  if (ids.length === 0) return [];
  const { rows } = await pool.query(
    `SELECT id FROM ${table} WHERE id = ANY($1::bigint[]) AND account_id = $2`,
    [ids, accountId]
  );
  const found = new Set(rows.map((row) => String(row.id)));
  return ids.filter((id) => !found.has(String(id)));
}

// True when pointing `id`'s parent column at `parentId` would close a loop.
// The DB can't express this, and a cycle makes the tree views recurse forever.
async function wouldCycle(table, parentColumn, id, parentId) {
  if (id === undefined || id === null) return false;
  if (String(id) === String(parentId)) return true;
  const { rows } = await pool.query(
    `WITH RECURSIVE ancestors AS (
       SELECT id, ${parentColumn} AS parent_id FROM ${table} WHERE id = $1
       UNION ALL
       SELECT t.id, t.${parentColumn} FROM ${table} t JOIN ancestors a ON t.id = a.parent_id
     )
     SELECT 1 FROM ancestors WHERE id = $2 LIMIT 1`,
    [parentId, id]
  );
  return rows.length > 0;
}

// Every place a project links to both an outcome and one of that outcome's
// ancestors. The ancestor already reaches the project through the descendant,
// so the direct link only duplicates it (and draws a second line on the map).
// Links come from project_outcomes and the older outcomes.project_id column.
// UNION rather than UNION ALL keeps the walk finite if parents ever loop.
async function redundantOutcomeLinks(executor, accountId) {
  const { rows } = await executor.query(
    `WITH RECURSIVE lineage AS (
       SELECT id AS outcome_id, parent_outcome_id AS ancestor_id
         FROM outcomes WHERE account_id = $1 AND parent_outcome_id IS NOT NULL
       UNION
       SELECT l.outcome_id, up.parent_outcome_id
         FROM lineage l JOIN outcomes up ON up.id = l.ancestor_id
        WHERE up.parent_outcome_id IS NOT NULL
     ),
     links AS (
       SELECT project_id, outcome_id FROM project_outcomes WHERE account_id = $1
       UNION
       SELECT project_id, id FROM outcomes WHERE account_id = $1 AND project_id IS NOT NULL
     )
     SELECT p.id AS project_id, p.name AS project_name,
            child.id AS outcome_id, child.name AS outcome_name,
            anc.id AS ancestor_id, anc.name AS ancestor_name
       FROM lineage l
       JOIN links via_child ON via_child.outcome_id = l.outcome_id
       JOIN links via_ancestor ON via_ancestor.outcome_id = l.ancestor_id
                              AND via_ancestor.project_id = via_child.project_id
       JOIN projects p ON p.id = via_child.project_id
       JOIN outcomes child ON child.id = l.outcome_id
       JOIN outcomes anc ON anc.id = l.ancestor_id`,
    [accountId]
  );
  return rows;
}

// The same for impacts: a project linked straight to an impact it already reaches
// through a child impact or through an outcome that rolls up to it. Outcomes roll
// up through their top-level ancestor, the only one that carries an impact.
async function redundantImpactLinks(executor, accountId) {
  const { rows } = await executor.query(
    `WITH RECURSIVE impact_lineage AS (
       SELECT id AS impact_id, id AS ancestor_id
         FROM impacts WHERE account_id = $1
       UNION
       SELECT l.impact_id, up.parent_impact_id
         FROM impact_lineage l JOIN impacts up ON up.id = l.ancestor_id
        WHERE up.parent_impact_id IS NOT NULL
     ),
     outcome_walk AS (
       SELECT id AS outcome_id, parent_outcome_id, impact_id
         FROM outcomes WHERE account_id = $1
       UNION
       SELECT w.outcome_id, up.parent_outcome_id, up.impact_id
         FROM outcome_walk w JOIN outcomes up ON up.id = w.parent_outcome_id
     ),
     outcome_links AS (
       SELECT project_id, outcome_id FROM project_outcomes WHERE account_id = $1
       UNION
       SELECT project_id, id FROM outcomes WHERE account_id = $1 AND project_id IS NOT NULL
     ),
     routes AS (
       SELECT ol.project_id, 'outcome-' || o.id AS via_id, o.name AS via_name, w.impact_id
         FROM outcome_links ol
         JOIN outcomes o ON o.id = ol.outcome_id
         JOIN outcome_walk w ON w.outcome_id = o.id AND w.impact_id IS NOT NULL
       UNION
       SELECT pi.project_id, 'impact-' || child.id, child.name, pi.impact_id
         FROM project_impacts pi
         JOIN impacts child ON child.id = pi.impact_id
        WHERE pi.account_id = $1
     )
     SELECT DISTINCT p.id AS project_id, p.name AS project_name,
            r.via_id AS outcome_id, r.via_name AS outcome_name,
            'impact-' || anc.id AS ancestor_id, anc.name AS ancestor_name
       FROM routes r
       JOIN impact_lineage reached ON reached.impact_id = r.impact_id
       JOIN project_impacts direct ON direct.project_id = r.project_id AND direct.impact_id = reached.ancestor_id
       JOIN projects p ON p.id = r.project_id
       JOIN impacts anc ON anc.id = reached.ancestor_id
      WHERE r.via_id <> 'impact-' || anc.id`,
    [accountId]
  );
  return rows;
}

async function redundantLinks(executor, accountId) {
  return [...(await redundantOutcomeLinks(executor, accountId)), ...(await redundantImpactLinks(executor, accountId))];
}

// Run inside a write's transaction: `before` is redundantLinks() taken before
// the write. Returns an error message naming the first link the write added,
// or null. Links that were already redundant are left for someone to tidy up
// rather than blocking unrelated edits.
async function newRedundantLink(executor, accountId, before) {
  const key = (row) => `${row.project_id}:${row.outcome_id}:${row.ancestor_id}`;
  const existing = new Set(before.map(key));
  const added = (await redundantLinks(executor, accountId)).find((row) => !existing.has(key(row)));
  if (!added) return null;
  return (
    `"${added.project_name}" already rolls up to "${added.ancestor_name}" through "${added.outcome_name}", ` +
    `so it can't link to both; link it to "${added.outcome_name}" only`
  );
}

module.exports = { belongsToAccount, missingFromAccount, wouldCycle, redundantLinks, newRedundantLink };
