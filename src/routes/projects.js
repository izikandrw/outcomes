const express = require('express');
const pool = require('../db');
const { belongsToAccount } = require('../lib/validateRef');

const router = express.Router({ mergeParams: true });

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM projects WHERE account_id = $1 ORDER BY id', [req.accountId]);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get('/:projectId', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM projects WHERE id = $1 AND account_id = $2', [
      req.params.projectId,
      req.accountId,
    ]);
    if (rows.length === 0) return res.status(404).json({ error: 'project not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  const { name, description, team_id } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  if (!team_id) return res.status(400).json({ error: 'team_id is required' });
  try {
    if (!(await belongsToAccount('teams', team_id, req.accountId))) {
      return res.status(400).json({ error: 'team_id not found in this account' });
    }
    const { rows } = await pool.query(
      'INSERT INTO projects (account_id, team_id, name, description) VALUES ($1, $2, $3, $4) RETURNING *',
      [req.accountId, team_id, name, description || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.put('/:projectId', async (req, res, next) => {
  const { name, description, team_id } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  if (!team_id) return res.status(400).json({ error: 'team_id is required' });
  try {
    if (!(await belongsToAccount('teams', team_id, req.accountId))) {
      return res.status(400).json({ error: 'team_id not found in this account' });
    }
    const { rows } = await pool.query(
      'UPDATE projects SET name = $1, description = $2, team_id = $3, updated_at = now() WHERE id = $4 AND account_id = $5 RETURNING *',
      [name, description || null, team_id, req.params.projectId, req.accountId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'project not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.delete('/:projectId', async (req, res, next) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM projects WHERE id = $1 AND account_id = $2', [
      req.params.projectId,
      req.accountId,
    ]);
    if (rowCount === 0) return res.status(404).json({ error: 'project not found' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
