const pool = require('../db');

// Deletes an outcome, impact or project along with the targets it owns and their
// readings. A target means nothing without its owner, so they go together. Anything
// else still pointing at the item, such as a child, raises 23503 and rolls the whole
// delete back, leaving the targets in place. Returns false when the item isn't in
// the account. `table` and `column` are constants from the routes, never user input.
async function deleteWithTargets(table, column, id, accountId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `DELETE FROM measurements
        WHERE target_id IN (SELECT id FROM targets WHERE ${column} = $1 AND account_id = $2)`,
      [id, accountId]
    );
    await client.query(`DELETE FROM targets WHERE ${column} = $1 AND account_id = $2`, [id, accountId]);
    const { rowCount } = await client.query(`DELETE FROM ${table} WHERE id = $1 AND account_id = $2`, [
      id,
      accountId,
    ]);
    await client.query('COMMIT');
    return rowCount > 0;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { deleteWithTargets };
