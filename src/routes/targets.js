const express = require('express');
const pool = require('../db');
const { belongsToAccount } = require('../lib/validateRef');

const router = express.Router({ mergeParams: true });

// Targets carry their latest reading and a reading count, so a caller can show
// progress without pulling the whole measurement series. How far along that is
// stays the caller's arithmetic: this returns the facts, not a percentage.
const SELECT_TARGET = `
  SELECT t.*,
         latest.value AS latest_value,
         latest.measured_at AS latest_measured_at,
         (SELECT count(*) FROM measurements m WHERE m.target_id = t.id)::int AS measurement_count
    FROM targets t
    LEFT JOIN LATERAL (
           SELECT m.value, m.measured_at
             FROM measurements m
            WHERE m.target_id = t.id
            ORDER BY m.measured_at DESC, m.id DESC
            LIMIT 1
         ) latest ON true
`;

// A target is only a target once it has a unit and both numbers, so all four
// are required on write rather than being allowed to fill in later.
async function validateBody(req, res) {
  const { outcome_id, name, unit, baseline_value, target_value } = req.body;
  if (!name) {
    res.status(400).json({ error: 'name is required' });
    return false;
  }
  if (!outcome_id) {
    res.status(400).json({ error: 'outcome_id is required' });
    return false;
  }
  if (!unit) {
    res.status(400).json({ error: 'unit is required' });
    return false;
  }
  for (const field of ['baseline_value', 'target_value']) {
    if (req.body[field] === undefined || req.body[field] === null || req.body[field] === '') {
      res.status(400).json({ error: `${field} is required` });
      return false;
    }
    if (!Number.isFinite(Number(req.body[field]))) {
      res.status(400).json({ error: `${field} must be a number` });
      return false;
    }
  }
  if (!(await belongsToAccount('outcomes', outcome_id, req.accountId))) {
    res.status(400).json({ error: 'outcome_id not found in this account' });
    return false;
  }
  return true;
}

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`${SELECT_TARGET} WHERE t.account_id = $1 ORDER BY t.id`, [
      req.accountId,
    ]);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get('/:targetId', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`${SELECT_TARGET} WHERE t.id = $1 AND t.account_id = $2`, [
      req.params.targetId,
      req.accountId,
    ]);
    if (rows.length === 0) return res.status(404).json({ error: 'target not found' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  const { outcome_id, name, description, unit, baseline_value, target_value, baseline_at, due_at } =
    req.body;
  try {
    if (!(await validateBody(req, res))) return;
    const { rows } = await pool.query(
      `INSERT INTO targets (account_id, outcome_id, name, description, unit,
         baseline_value, target_value, baseline_at, due_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, now()), $9) RETURNING *`,
      [
        req.accountId,
        outcome_id,
        name,
        description || null,
        unit,
        Number(baseline_value),
        Number(target_value),
        baseline_at || null,
        due_at || null,
      ]
    );
    res.status(201).json({ ...rows[0], latest_value: null, latest_measured_at: null, measurement_count: 0 });
  } catch (err) {
    next(err);
  }
});

router.put('/:targetId', async (req, res, next) => {
  const { outcome_id, name, description, unit, baseline_value, target_value, baseline_at, due_at } =
    req.body;
  try {
    if (!(await validateBody(req, res))) return;
    const { rowCount } = await pool.query(
      `UPDATE targets SET outcome_id = $1, name = $2, description = $3, unit = $4,
         baseline_value = $5, target_value = $6, baseline_at = COALESCE($7, baseline_at),
         due_at = $8, updated_at = now()
       WHERE id = $9 AND account_id = $10`,
      [
        outcome_id,
        name,
        description || null,
        unit,
        Number(baseline_value),
        Number(target_value),
        baseline_at || null,
        due_at || null,
        req.params.targetId,
        req.accountId,
      ]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'target not found' });
    // Re-read so the response carries the same derived fields as a GET.
    const { rows } = await pool.query(`${SELECT_TARGET} WHERE t.id = $1 AND t.account_id = $2`, [
      req.params.targetId,
      req.accountId,
    ]);
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.delete('/:targetId', async (req, res, next) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM targets WHERE id = $1 AND account_id = $2', [
      req.params.targetId,
      req.accountId,
    ]);
    if (rowCount === 0) return res.status(404).json({ error: 'target not found' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
