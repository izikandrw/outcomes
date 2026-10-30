const express = require('express');
const pool = require('../db');
const {
  belongsToAccount,
  missingFromAccount,
  wouldCycle,
  redundantLinks,
  newRedundantLink,
} = require('../lib/validateRef');
const { adoptProposals } = require('../lib/adoptProposals');

const router = express.Router({ mergeParams: true });

// Every read shape carries the linked outcome ids so a client can render a
// project's outcomes without a second round trip.
const SELECT_PROJECT = `
  SELECT p.*,
         COALESCE(
           array_agg(po.outcome_id ORDER BY po.outcome_id) FILTER (WHERE po.outcome_id IS NOT NULL),
           '{}'
         ) AS outcome_ids
    FROM projects p
    LEFT JOIN project_outcomes po ON po.project_id = p.id
`;

async function fetchProject(executor, projectId, accountId) {
  const { rows } = await executor.query(
    `${SELECT_PROJECT} WHERE p.id = $1 AND p.account_id = $2 GROUP BY p.id`,
    [projectId, accountId]
  );
  return rows[0] ?? null;
}

// Validates team_id, parent_project_id and outcome_ids against the account.
// Writes the response and returns null when something doesn't check out;
// otherwise returns the normalised values. `projectId` is set when updating,
// so the parent check can also reject cycles.
async function readRefs(req, res, projectId) {
  const { team_id, parent_project_id, outcome_ids } = req.body;

  // Optional: the team running it often isn't known yet when it's written down.
  if (team_id && !(await belongsToAccount('teams', team_id, req.accountId))) {
    res.status(400).json({ error: 'team_id not found in this account' });
    return null;
  }

  if (parent_project_id) {
    if (!(await belongsToAccount('projects', parent_project_id, req.accountId))) {
      res.status(400).json({ error: 'parent_project_id not found in this account' });
      return null;
    }
    if (await wouldCycle('projects', 'parent_project_id', projectId, parent_project_id)) {
      res.status(400).json({ error: 'parent_project_id would make a project its own ancestor' });
      return null;
    }
  }

  let outcomes;
  if (outcome_ids !== undefined) {
    if (!Array.isArray(outcome_ids)) {
      res.status(400).json({ error: 'outcome_ids must be an array' });
      return null;
    }
    outcomes = [...new Set(outcome_ids.map(String))];
    const missing = await missingFromAccount('outcomes', outcomes, req.accountId);
    if (missing.length > 0) {
      res.status(400).json({ error: `outcome_ids not found in this account: ${missing.join(', ')}` });
      return null;
    }
  }

  return {
    teamId: team_id || null,
    parentProjectId: parent_project_id || null,
    outcomeIds: outcomes,
  };
}

// Replaces a project's outcome links with `outcomeIds`. Left alone when the
// request didn't mention outcome_ids at all.
async function replaceLinks(client, projectId, accountId, outcomeIds) {
  if (outcomeIds === undefined) return;
  await client.query('DELETE FROM project_outcomes WHERE project_id = $1 AND account_id = $2', [
    projectId,
    accountId,
  ]);
  if (outcomeIds.length === 0) return;
  await client.query(
    `INSERT INTO project_outcomes (account_id, project_id, outcome_id)
     SELECT $1, $2, unnest($3::bigint[])`,
    [accountId, projectId, outcomeIds]
  );
}

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `${SELECT_PROJECT} WHERE p.account_id = $1 GROUP BY p.id ORDER BY p.id`,
      [req.accountId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get('/:projectId', async (req, res, next) => {
  try {
    const project = await fetchProject(pool, req.params.projectId, req.accountId);
    if (!project) return res.status(404).json({ error: 'project not found' });
    res.json(project);
  } catch (err) {
    next(err);
  }
});

// The outcomes a project supports, for a project-first view of the tree.
router.get('/:projectId/outcomes', async (req, res, next) => {
  try {
    const project = await fetchProject(pool, req.params.projectId, req.accountId);
    if (!project) return res.status(404).json({ error: 'project not found' });
    const { rows } = await pool.query(
      `SELECT o.* FROM outcomes o
         JOIN project_outcomes po ON po.outcome_id = o.id
        WHERE po.project_id = $1 AND o.account_id = $2
        ORDER BY o.id`,
      [req.params.projectId, req.accountId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  const { name, description, start_at, end_at } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  if (start_at && end_at && new Date(end_at) < new Date(start_at)) {
    return res.status(400).json({ error: 'end_at cannot be before start_at' });
  }

  let client;
  try {
    const refs = await readRefs(req, res, null);
    if (!refs) return;

    client = await pool.connect();
    await client.query('BEGIN');
    const before = await redundantLinks(client, req.accountId);
    const { rows } = await client.query(
      `INSERT INTO projects (account_id, team_id, parent_project_id, name, description, start_at, end_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        req.accountId,
        refs.teamId,
        refs.parentProjectId,
        name,
        description || null,
        start_at || null,
        end_at || null,
      ]
    );
    await replaceLinks(client, rows[0].id, req.accountId, refs.outcomeIds ?? []);
    const redundant = await newRedundantLink(client, req.accountId, before);
    if (redundant) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: redundant });
    }
    // Insights awaiting review that proposed this project by name now link to it.
    await adoptProposals(client, req.accountId);
    await client.query('COMMIT');

    res.status(201).json(await fetchProject(pool, rows[0].id, req.accountId));
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    if (client) client.release();
  }
});

router.put('/:projectId', async (req, res, next) => {
  const { name, description, start_at, end_at } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  if (start_at && end_at && new Date(end_at) < new Date(start_at)) {
    return res.status(400).json({ error: 'end_at cannot be before start_at' });
  }

  let client;
  try {
    const refs = await readRefs(req, res, req.params.projectId);
    if (!refs) return;

    client = await pool.connect();
    await client.query('BEGIN');
    const before = await redundantLinks(client, req.accountId);
    const { rows } = await client.query(
      `UPDATE projects SET name = $1, description = $2, team_id = $3, parent_project_id = $4,
         start_at = $5, end_at = $6, updated_at = now()
       WHERE id = $7 AND account_id = $8 RETURNING id`,
      [
        name,
        description || null,
        refs.teamId,
        refs.parentProjectId,
        start_at || null,
        end_at || null,
        req.params.projectId,
        req.accountId,
      ]
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'project not found' });
    }
    await replaceLinks(client, rows[0].id, req.accountId, refs.outcomeIds);
    const redundant = await newRedundantLink(client, req.accountId, before);
    if (redundant) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: redundant });
    }
    // Insights awaiting review that proposed this project by name now link to it.
    await adoptProposals(client, req.accountId);
    await client.query('COMMIT');

    res.json(await fetchProject(pool, req.params.projectId, req.accountId));
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    if (client) client.release();
  }
});

router.delete('/:projectId', async (req, res, next) => {
  try {
    // project_outcomes rows cascade; child projects and outcomes still
    // referencing this one raise 23503, which app.js turns into a 409.
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
