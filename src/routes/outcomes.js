const express = require('express');
const pool = require('../db');
const { belongsToAccount } = require('../lib/validateRef');

const router = express.Router({ mergeParams: true });

// Outcomes carry the ids of every project linked to them through
// project_outcomes. Links are written from the project side; this is the
// read-only mirror so an outcome can show what's driving it.
const SELECT_OUTCOME = `
  SELECT o.*,
         COALESCE(
           array_agg(po.project_id ORDER BY po.project_id) FILTER (WHERE po.project_id IS NOT NULL),
           '{}'
         ) AS project_ids
    FROM outcomes o
    LEFT JOIN project_outcomes po ON po.outcome_id = o.id
`;

async function validateRefs(req, res) {
  const { team_id, project_id, parent_outcome_id } = req.body;
  if (!team_id) {
    res.status(400).json({ error: 'team_id is required' });
    return false;
  }
  if (!(await belongsToAccount('teams', team_id, req.accountId))) {
    res.status(400).json({ error: 'team_id not found in this account' });
    return false;
  }
  if (project_id && !(await belongsToAccount('projects', project_id, req.accountId))) {
    res.status(400).json({ error: 'project_id not found in this account' });
    return false;
  }
  if (parent_outcome_id && !(await belongsToAccount('outcomes', parent_outcome_id, req.accountId))) {
    res.status(400).json({ error: 'parent_outcome_id not found in this account' });
    return false;
  }
  return true;
}

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `${SELECT_OUTCOME} WHERE o.account_id = $1 GROUP BY o.id ORDER BY o.id`,
      [req.accountId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get('/:outcomeId', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `${SELECT_OUTCOME} WHERE o.id = $1 AND o.account_id = $2 GROUP BY o.id`,
      [req.params.outcomeId, req.accountId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'outcome not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  const { name, description, team_id, project_id, parent_outcome_id } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
    if (!(await validateRefs(req, res))) return;
    const { rows } = await pool.query(
      `INSERT INTO outcomes (account_id, team_id, project_id, parent_outcome_id, name, description)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.accountId, team_id, project_id || null, parent_outcome_id || null, name, description || null]
    );
    res.status(201).json({ ...rows[0], project_ids: [] });
  } catch (err) {
    next(err);
  }
});

router.put('/:outcomeId', async (req, res, next) => {
  const { name, description, team_id, project_id, parent_outcome_id } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
    if (!(await validateRefs(req, res))) return;
    const { rows } = await pool.query(
      `UPDATE outcomes SET name = $1, description = $2, team_id = $3, project_id = $4,
         parent_outcome_id = $5, updated_at = now()
       WHERE id = $6 AND account_id = $7 RETURNING *`,
      [name, description || null, team_id, project_id || null, parent_outcome_id || null, req.params.outcomeId, req.accountId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'outcome not found' });
    const { rows: linked } = await pool.query(
      'SELECT project_id FROM project_outcomes WHERE outcome_id = $1 ORDER BY project_id',
      [req.params.outcomeId]
    );
    res.json({ ...rows[0], project_ids: linked.map((row) => row.project_id) });
  } catch (err) {
    next(err);
  }
});

router.delete('/:outcomeId', async (req, res, next) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM outcomes WHERE id = $1 AND account_id = $2', [
      req.params.outcomeId,
      req.accountId,
    ]);
    if (rowCount === 0) return res.status(404).json({ error: 'outcome not found' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
