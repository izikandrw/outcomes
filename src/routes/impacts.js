const express = require('express');
const pool = require('../db');
const { belongsToAccount, wouldCycle } = require('../lib/validateRef');

const router = express.Router({ mergeParams: true });

// Checks parent_impact_id against the account and rejects a parent that would
// make an impact its own ancestor. `impactId` is set when updating.
async function validateParent(req, res, impactId) {
  const { parent_impact_id } = req.body;
  if (!parent_impact_id) return true;
  if (!(await belongsToAccount('impacts', parent_impact_id, req.accountId))) {
    res.status(400).json({ error: 'parent_impact_id not found in this account' });
    return false;
  }
  if (await wouldCycle('impacts', 'parent_impact_id', impactId, parent_impact_id)) {
    res.status(400).json({ error: 'parent_impact_id would make an impact its own ancestor' });
    return false;
  }
  return true;
}

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM impacts WHERE account_id = $1 ORDER BY id', [
      req.accountId,
    ]);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get('/:impactId', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM impacts WHERE id = $1 AND account_id = $2', [
      req.params.impactId,
      req.accountId,
    ]);
    if (rows.length === 0) return res.status(404).json({ error: 'impact not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  const { name, description, parent_impact_id } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
    if (!(await validateParent(req, res, null))) return;
    const { rows } = await pool.query(
      `INSERT INTO impacts (account_id, parent_impact_id, name, description)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.accountId, parent_impact_id || null, name, description || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.put('/:impactId', async (req, res, next) => {
  const { name, description, parent_impact_id } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
    if (!(await validateParent(req, res, req.params.impactId))) return;
    const { rows } = await pool.query(
      `UPDATE impacts SET name = $1, description = $2, parent_impact_id = $3, updated_at = now()
       WHERE id = $4 AND account_id = $5 RETURNING *`,
      [name, description || null, parent_impact_id || null, req.params.impactId, req.accountId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'impact not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.delete('/:impactId', async (req, res, next) => {
  try {
    // Child impacts, linked outcomes and targets still pointing here raise
    // 23503, which app.js turns into a 409. project_impacts rows cascade.
    const { rowCount } = await pool.query('DELETE FROM impacts WHERE id = $1 AND account_id = $2', [
      req.params.impactId,
      req.accountId,
    ]);
    if (rowCount === 0) return res.status(404).json({ error: 'impact not found' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
