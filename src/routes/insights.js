const express = require('express');
const pool = require('../db');
const { belongsToAccount, missingFromAccount } = require('../lib/validateRef');

const router = express.Router({ mergeParams: true });

const TYPES = ['support_ticket', 'session_recording', 'interview', 'funnel', 'experiment', 'other'];

// Every read shape carries the linked outcome and project ids so a client can
// render an insight's evidence trail without extra round trips.
const SELECT_INSIGHT = `
  SELECT i.*,
         COALESCE(
           (SELECT array_agg(io.outcome_id ORDER BY io.outcome_id) FROM insight_outcomes io WHERE io.insight_id = i.id),
           '{}'
         ) AS outcome_ids,
         COALESCE(
           (SELECT array_agg(ip.project_id ORDER BY ip.project_id) FROM insight_projects ip WHERE ip.insight_id = i.id),
           '{}'
         ) AS project_ids
    FROM insights i
`;

async function fetchInsight(executor, insightId, accountId) {
  const { rows } = await executor.query(`${SELECT_INSIGHT} WHERE i.id = $1 AND i.account_id = $2`, [
    insightId,
    accountId,
  ]);
  return rows[0] ?? null;
}

// Validates the body. Writes the response and returns null when something
// doesn't check out; otherwise returns the normalised values.
async function readBody(req, res) {
  const { name, type, description, source, observed_at, team_id, outcome_ids, project_ids } = req.body;

  if (!name) {
    res.status(400).json({ error: 'name is required' });
    return null;
  }
  if (type !== undefined && !TYPES.includes(type)) {
    res.status(400).json({ error: `type must be one of: ${TYPES.join(', ')}` });
    return null;
  }
  if (team_id && !(await belongsToAccount('teams', team_id, req.accountId))) {
    res.status(400).json({ error: 'team_id not found in this account' });
    return null;
  }

  const links = {};
  for (const [field, table, ids] of [
    ['outcome_ids', 'outcomes', outcome_ids],
    ['project_ids', 'projects', project_ids],
  ]) {
    if (ids === undefined) continue;
    if (!Array.isArray(ids)) {
      res.status(400).json({ error: `${field} must be an array` });
      return null;
    }
    const unique = [...new Set(ids.map(String))];
    const missing = await missingFromAccount(table, unique, req.accountId);
    if (missing.length > 0) {
      res.status(400).json({ error: `${field} not found in this account: ${missing.join(', ')}` });
      return null;
    }
    links[field] = unique;
  }

  return {
    name,
    type: type || 'other',
    description: description || null,
    source: source || null,
    observedAt: observed_at || null,
    teamId: team_id || null,
    outcomeIds: links.outcome_ids,
    projectIds: links.project_ids,
  };
}

// Replaces an insight's links in `table` with `ids`. Left alone when the
// request didn't mention the field at all.
async function replaceLinks(client, table, column, insightId, accountId, ids) {
  if (ids === undefined) return;
  await client.query(`DELETE FROM ${table} WHERE insight_id = $1 AND account_id = $2`, [insightId, accountId]);
  if (ids.length === 0) return;
  await client.query(
    `INSERT INTO ${table} (account_id, insight_id, ${column}) SELECT $1, $2, unnest($3::bigint[])`,
    [accountId, insightId, ids]
  );
}

async function replaceAllLinks(client, insightId, accountId, input) {
  await replaceLinks(client, 'insight_outcomes', 'outcome_id', insightId, accountId, input.outcomeIds);
  await replaceLinks(client, 'insight_projects', 'project_id', insightId, accountId, input.projectIds);
}

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`${SELECT_INSIGHT} WHERE i.account_id = $1 ORDER BY i.id`, [
      req.accountId,
    ]);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get('/:insightId', async (req, res, next) => {
  try {
    const insight = await fetchInsight(pool, req.params.insightId, req.accountId);
    if (!insight) return res.status(404).json({ error: 'insight not found' });
    res.json(insight);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  let client;
  try {
    const input = await readBody(req, res);
    if (!input) return;

    client = await pool.connect();
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO insights (account_id, team_id, name, type, description, source, observed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [req.accountId, input.teamId, input.name, input.type, input.description, input.source, input.observedAt]
    );
    await replaceAllLinks(client, rows[0].id, req.accountId, {
      outcomeIds: input.outcomeIds ?? [],
      projectIds: input.projectIds ?? [],
    });
    await client.query('COMMIT');

    res.status(201).json(await fetchInsight(pool, rows[0].id, req.accountId));
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    if (client) client.release();
  }
});

router.put('/:insightId', async (req, res, next) => {
  let client;
  try {
    const input = await readBody(req, res);
    if (!input) return;

    client = await pool.connect();
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE insights SET name = $1, type = $2, description = $3, source = $4, observed_at = $5,
         team_id = $6, updated_at = now()
       WHERE id = $7 AND account_id = $8 RETURNING id`,
      [
        input.name,
        input.type,
        input.description,
        input.source,
        input.observedAt,
        input.teamId,
        req.params.insightId,
        req.accountId,
      ]
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'insight not found' });
    }
    await replaceAllLinks(client, rows[0].id, req.accountId, input);
    await client.query('COMMIT');

    res.json(await fetchInsight(pool, req.params.insightId, req.accountId));
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    if (client) client.release();
  }
});

router.delete('/:insightId', async (req, res, next) => {
  try {
    // insight_outcomes and insight_projects rows cascade.
    const { rowCount } = await pool.query('DELETE FROM insights WHERE id = $1 AND account_id = $2', [
      req.params.insightId,
      req.accountId,
    ]);
    if (rowCount === 0) return res.status(404).json({ error: 'insight not found' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
