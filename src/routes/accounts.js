const express = require('express');
const pool = require('../db');
const accountScope = require('../middleware/accountScope');
const teamsRouter = require('./teams');
const projectsRouter = require('./projects');
const outcomesRouter = require('./outcomes');
const targetsRouter = require('./targets');
const measurementsRouter = require('./measurements');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM accounts ORDER BY id');
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get('/:accountId', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM accounts WHERE id = $1', [req.params.accountId]);
    if (rows.length === 0) return res.status(404).json({ error: 'account not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
    const { rows } = await pool.query('INSERT INTO accounts (name) VALUES ($1) RETURNING *', [name]);
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.put('/:accountId', async (req, res, next) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
    const { rows } = await pool.query(
      'UPDATE accounts SET name = $1, updated_at = now() WHERE id = $2 RETURNING *',
      [name, req.params.accountId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'account not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.delete('/:accountId', async (req, res, next) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM accounts WHERE id = $1', [req.params.accountId]);
    if (rowCount === 0) return res.status(404).json({ error: 'account not found' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

router.use('/:accountId/teams', accountScope, teamsRouter);
router.use('/:accountId/projects', accountScope, projectsRouter);
router.use('/:accountId/outcomes', accountScope, outcomesRouter);
router.use('/:accountId/targets', accountScope, targetsRouter);
router.use('/:accountId/measurements', accountScope, measurementsRouter);

module.exports = router;
