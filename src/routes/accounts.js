const express = require('express');
const pool = require('../db');
const { requireAdmin } = require('../middleware/requireAuth');
const { validLogo, LOGO_ERROR } = require('../lib/logo');
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
const evalCasesRouter = require('./evalCases');

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

// Leaving logo out keeps the current one; null removes it.
router.put('/:accountId', accountScope, requireAdmin, async (req, res, next) => {
  const { name, logo } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  if (!validLogo(logo)) return res.status(400).json({ error: LOGO_ERROR });
  try {
    const { rows } = await pool.query(
      `UPDATE accounts SET name = $1, logo = CASE WHEN $3::boolean THEN $4 ELSE logo END, updated_at = now()
       WHERE id = $2 RETURNING *`,
      [name, req.params.accountId, logo !== undefined, logo ?? null]
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
router.use('/:accountId/eval-cases', accountScope, evalCasesRouter);

module.exports = router;
