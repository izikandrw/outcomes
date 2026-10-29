const express = require('express');
const pool = require('../db');
const { requireAdmin } = require('../middleware/requireAuth');
const usersRouter = require('./users');
const accountScope = require('../middleware/accountScope');
const collectorScope = require('../middleware/collectorScope');
const teamsRouter = require('./teams');
const projectsRouter = require('./projects');
const impactsRouter = require('./impacts');
const outcomesRouter = require('./outcomes');
const targetsRouter = require('./targets');
const insightsRouter = require('./insights');
const measurementsRouter = require('./measurements');
const collectionRunsRouter = require('./collectionRuns');

const router = express.Router();

router.use(collectorScope);

router.get('/:accountId', accountScope, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM accounts WHERE id = $1', [req.params.accountId]);
    if (rows.length === 0) return res.status(404).json({ error: 'account not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.put('/:accountId', accountScope, requireAdmin, async (req, res, next) => {
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

router.use('/:accountId', accountScope, usersRouter);
router.use('/:accountId/teams', accountScope, teamsRouter);
router.use('/:accountId/projects', accountScope, projectsRouter);
router.use('/:accountId/impacts', accountScope, impactsRouter);
router.use('/:accountId/outcomes', accountScope, outcomesRouter);
router.use('/:accountId/targets', accountScope, targetsRouter);
router.use('/:accountId/insights', accountScope, insightsRouter);
router.use('/:accountId/measurements', accountScope, measurementsRouter);
router.use('/:accountId/collection-runs', accountScope, collectionRunsRouter);

module.exports = router;
