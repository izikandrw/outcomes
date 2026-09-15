const express = require('express');
const pool = require('../db');
const { belongsToAccount } = require('../lib/validateRef');

const router = express.Router({ mergeParams: true });

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM measurements WHERE account_id = $1 ORDER BY id', [
      req.accountId,
    ]);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get('/:measurementId', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM measurements WHERE id = $1 AND account_id = $2', [
      req.params.measurementId,
      req.accountId,
    ]);
    if (rows.length === 0) return res.status(404).json({ error: 'measurement not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  const { target_id, value, measured_at } = req.body;
  if (!target_id) return res.status(400).json({ error: 'target_id is required' });
  if (value === undefined || value === null) return res.status(400).json({ error: 'value is required' });
  try {
    if (!(await belongsToAccount('targets', target_id, req.accountId))) {
      return res.status(400).json({ error: 'target_id not found in this account' });
    }
    const { rows } = await pool.query(
      `INSERT INTO measurements (account_id, target_id, value, measured_at)
       VALUES ($1, $2, $3, COALESCE($4, now())) RETURNING *`,
      [req.accountId, target_id, value, measured_at || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.put('/:measurementId', async (req, res, next) => {
  const { target_id, value, measured_at } = req.body;
  if (!target_id) return res.status(400).json({ error: 'target_id is required' });
  if (value === undefined || value === null) return res.status(400).json({ error: 'value is required' });
  try {
    if (!(await belongsToAccount('targets', target_id, req.accountId))) {
      return res.status(400).json({ error: 'target_id not found in this account' });
    }
    const { rows } = await pool.query(
      `UPDATE measurements SET target_id = $1, value = $2, measured_at = COALESCE($3, measured_at)
       WHERE id = $4 AND account_id = $5 RETURNING *`,
      [target_id, value, measured_at || null, req.params.measurementId, req.accountId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'measurement not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.delete('/:measurementId', async (req, res, next) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM measurements WHERE id = $1 AND account_id = $2', [
      req.params.measurementId,
      req.accountId,
    ]);
    if (rowCount === 0) return res.status(404).json({ error: 'measurement not found' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
