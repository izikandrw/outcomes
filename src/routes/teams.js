const express = require('express');
const pool = require('../db');
const { belongsToAccount } = require('../lib/validateRef');

const router = express.Router({ mergeParams: true });

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM teams WHERE account_id = $1 ORDER BY id', [req.accountId]);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get('/:teamId', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM teams WHERE id = $1 AND account_id = $2', [
      req.params.teamId,
      req.accountId,
    ]);
    if (rows.length === 0) return res.status(404).json({ error: 'team not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  const { name, parent_team_id } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
    if (parent_team_id && !(await belongsToAccount('teams', parent_team_id, req.accountId))) {
      return res.status(400).json({ error: 'parent_team_id not found in this account' });
    }
    const { rows } = await pool.query(
      'INSERT INTO teams (account_id, parent_team_id, name) VALUES ($1, $2, $3) RETURNING *',
      [req.accountId, parent_team_id || null, name]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.put('/:teamId', async (req, res, next) => {
  const { name, parent_team_id } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
    if (parent_team_id && !(await belongsToAccount('teams', parent_team_id, req.accountId))) {
      return res.status(400).json({ error: 'parent_team_id not found in this account' });
    }
    const { rows } = await pool.query(
      'UPDATE teams SET name = $1, parent_team_id = $2, updated_at = now() WHERE id = $3 AND account_id = $4 RETURNING *',
      [name, parent_team_id || null, req.params.teamId, req.accountId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'team not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.delete('/:teamId', async (req, res, next) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM teams WHERE id = $1 AND account_id = $2', [
      req.params.teamId,
      req.accountId,
    ]);
    if (rowCount === 0) return res.status(404).json({ error: 'team not found' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
