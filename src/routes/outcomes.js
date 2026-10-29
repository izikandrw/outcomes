const express = require('express');
const pool = require('../db');
const { belongsToAccount, missingFromAccount, redundantLinks, newRedundantLink } = require('../lib/validateRef');

const router = express.Router({ mergeParams: true });

// Outcomes carry the ids of every project linked to them through
// project_outcomes. Links can be written from either side: a project's
// outcome_ids or an outcome's project_ids.
const SELECT_OUTCOME = `
  SELECT o.*,
         COALESCE(
           array_agg(po.project_id ORDER BY po.project_id) FILTER (WHERE po.project_id IS NOT NULL),
           '{}'
         ) AS project_ids
    FROM outcomes o
    LEFT JOIN project_outcomes po ON po.outcome_id = o.id
`;

async function fetchOutcome(executor, outcomeId, accountId) {
  const { rows } = await executor.query(
    `${SELECT_OUTCOME} WHERE o.id = $1 AND o.account_id = $2 GROUP BY o.id`,
    [outcomeId, accountId]
  );
  return rows[0] ?? null;
}

// Validates the refs and returns the normalised project_ids (undefined when the
// request didn't mention them). Writes the response and returns false when
// something doesn't check out.
async function validateRefs(req, res) {
  const { team_id, project_id, project_ids, parent_outcome_id, impact_id } = req.body;
  // Optional: the accountable team often isn't known yet when it's written down.
  if (team_id && !(await belongsToAccount('teams', team_id, req.accountId))) {
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
  if (impact_id) {
    // Child outcomes inherit their impact from their top-level ancestor, so the
    // link is only stored once, on the top-level outcome.
    if (parent_outcome_id) {
      res.status(400).json({ error: 'impact_id can only be set on a top-level outcome' });
      return false;
    }
    if (!(await belongsToAccount('impacts', impact_id, req.accountId))) {
      res.status(400).json({ error: 'impact_id not found in this account' });
      return false;
    }
  }
  if (project_ids === undefined) return { projectIds: undefined };
  if (!Array.isArray(project_ids)) {
    res.status(400).json({ error: 'project_ids must be an array' });
    return false;
  }
  const projectIds = [...new Set(project_ids.map(String))];
  const missing = await missingFromAccount('projects', projectIds, req.accountId);
  if (missing.length > 0) {
    res.status(400).json({ error: `project_ids not found in this account: ${missing.join(', ')}` });
    return false;
  }
  return { projectIds };
}

// Replaces an outcome's project links with `projectIds`. Left alone when the
// request didn't mention project_ids at all.
async function replaceLinks(client, outcomeId, accountId, projectIds) {
  if (projectIds === undefined) return;
  await client.query('DELETE FROM project_outcomes WHERE outcome_id = $1 AND account_id = $2', [
    outcomeId,
    accountId,
  ]);
  if (projectIds.length === 0) return;
  await client.query(
    `INSERT INTO project_outcomes (account_id, project_id, outcome_id)
     SELECT $1, unnest($2::bigint[]), $3`,
    [accountId, projectIds, outcomeId]
  );
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
    const outcome = await fetchOutcome(pool, req.params.outcomeId, req.accountId);
    if (!outcome) return res.status(404).json({ error: 'outcome not found' });
    res.json(outcome);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  const { name, description, team_id, project_id, parent_outcome_id, impact_id } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  let client;
  try {
    const refs = await validateRefs(req, res);
    if (!refs) return;

    client = await pool.connect();
    await client.query('BEGIN');
    const before = await redundantLinks(client, req.accountId);
    const { rows } = await client.query(
      `INSERT INTO outcomes (account_id, team_id, project_id, parent_outcome_id, impact_id, name, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        req.accountId,
        team_id || null,
        project_id || null,
        parent_outcome_id || null,
        impact_id || null,
        name,
        description || null,
      ]
    );
    await replaceLinks(client, rows[0].id, req.accountId, refs.projectIds);
    // Checked after the write so a new parent counts as well as new projects.
    const redundant = await newRedundantLink(client, req.accountId, before);
    if (redundant) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: redundant });
    }
    await client.query('COMMIT');

    res.status(201).json(await fetchOutcome(pool, rows[0].id, req.accountId));
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    if (client) client.release();
  }
});

router.put('/:outcomeId', async (req, res, next) => {
  const { name, description, team_id, project_id, parent_outcome_id, impact_id } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  let client;
  try {
    const refs = await validateRefs(req, res);
    if (!refs) return;

    client = await pool.connect();
    await client.query('BEGIN');
    const before = await redundantLinks(client, req.accountId);
    const { rows } = await client.query(
      `UPDATE outcomes SET name = $1, description = $2, team_id = $3, project_id = $4,
         parent_outcome_id = $5, impact_id = $6, updated_at = now()
       WHERE id = $7 AND account_id = $8 RETURNING id`,
      [
        name,
        description || null,
        team_id || null,
        project_id || null,
        parent_outcome_id || null,
        impact_id || null,
        req.params.outcomeId,
        req.accountId,
      ]
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'outcome not found' });
    }
    await replaceLinks(client, rows[0].id, req.accountId, refs.projectIds);
    // Checked after the write so a new parent counts as well as new projects.
    const redundant = await newRedundantLink(client, req.accountId, before);
    if (redundant) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: redundant });
    }
    await client.query('COMMIT');

    res.json(await fetchOutcome(pool, req.params.outcomeId, req.accountId));
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    if (client) client.release();
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
