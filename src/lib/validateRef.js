const pool = require('../db');

// Confirms `id` exists in `table` and belongs to `accountId`.
// Used to stop a request from linking a row to a parent from a different account.
async function belongsToAccount(table, id, accountId) {
  const { rows } = await pool.query(`SELECT id FROM ${table} WHERE id = $1 AND account_id = $2`, [id, accountId]);
  return rows.length > 0;
}

module.exports = { belongsToAccount };
