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

module.exports = { belongsToAccount, missingFromAccount, wouldCycle };
