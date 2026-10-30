const express = require('express');
const pool = require('../db');
const { missingFromAccount } = require('../lib/validateRef');
const { listEvents } = require('../lib/insightEvents');

// Runs of the insight collector agent: what it read, what it decided about each
// document and why, and how people then judged its suggestions. This is the
// trace used to find its mistakes and pick eval cases
// (product/agents/insight-collector/design.md, "Run traces").
const router = express.Router({ mergeParams: true });

const DECISIONS = ['suggested', 'no_insight', 'already_collected'];

// Each run with its document count and how its suggestions fared in review.
const SELECT_RUN = `
  SELECT r.*,
         (SELECT count(*)::int FROM collection_run_documents d WHERE d.run_id = r.id) AS document_count,
         (SELECT json_build_object(
                   'suggested', count(*)::int,
                   'unvalidated', count(*) FILTER (WHERE i.status = 'unvalidated')::int,
                   'validated', count(*) FILTER (WHERE i.status = 'validated')::int,
                   'rejected', count(*) FILTER (WHERE i.status = 'rejected')::int,
                   'edited', count(*) FILTER (WHERE i.edited_in_review)::int)
            FROM insights i WHERE i.collection_run_id = r.id) AS review
    FROM collection_runs r
`;

async function fetchRun(runId, accountId) {
  const { rows } = await pool.query(`${SELECT_RUN} WHERE r.id = $1 AND r.account_id = $2`, [runId, accountId]);
  return rows[0] ?? null;
}

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`${SELECT_RUN} WHERE r.account_id = $1 ORDER BY r.id DESC`, [req.accountId]);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// The full trace: the run, every document in the order it was read, and the
// run's suggestions with their review outcome and history (insight_events):
// what the collector said, and every change and verdict since.
router.get('/:runId', async (req, res, next) => {
  try {
    const run = await fetchRun(req.params.runId, req.accountId);
    if (!run) return res.status(404).json({ error: 'collection run not found' });
    const [{ rows: documents }, { rows: insights }] = await Promise.all([
      pool.query('SELECT * FROM collection_run_documents WHERE run_id = $1 AND account_id = $2 ORDER BY id', [
        run.id,
        req.accountId,
      ]),
      pool.query(
        `SELECT id, name, type, status, firsthand, source_external_id, source_excerpt, dollar_impact,
                edited_in_review, rejection_reason, review_note, reviewed_at
           FROM insights WHERE collection_run_id = $1 AND account_id = $2 ORDER BY id`,
        [run.id, req.accountId]
      ),
    ]);
    // Which eval sets each document is already in, so it isn't added twice.
    const { rows: cases } = await pool.query(
      `SELECT id, run_document_id, label_source, status FROM eval_cases
        WHERE account_id = $1 AND run_document_id = ANY($2::bigint[])`,
      [req.accountId, documents.map((doc) => doc.id)]
    );
    for (const doc of documents) doc.eval_cases = cases.filter((entry) => String(entry.run_document_id) === String(doc.id));
    const events = await listEvents(pool, req.accountId, insights.map((insight) => insight.id));
    for (const insight of insights) insight.events = events.filter((event) => String(event.insight_id) === String(insight.id));
    res.json({ ...run, documents, insights });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  const { source_system, source_name, unit, model, prompt_version } = req.body;
  if (!source_system) return res.status(400).json({ error: 'source_system is required' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO collection_runs (account_id, source_system, source_config, model, prompt_version)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [req.accountId, source_system, { source_name: source_name || null, unit: unit || null }, model || null, prompt_version || null]
    );
    res.status(201).json(await fetchRun(rows[0].id, req.accountId));
  } catch (err) {
    next(err);
  }
});

// A run only takes documents, and only finishes, while it is running.
async function runningRun(req, res) {
  const { rows } = await pool.query('SELECT id, status FROM collection_runs WHERE id = $1 AND account_id = $2', [
    req.params.runId,
    req.accountId,
  ]);
  if (rows.length === 0) {
    res.status(404).json({ error: 'collection run not found' });
    return null;
  }
  if (rows[0].status !== 'running') {
    res.status(409).json({ error: `collection run already ${rows[0].status}` });
    return null;
  }
  return rows[0];
}

router.post('/:runId/documents', async (req, res, next) => {
  const { external_id, title, text, decision, reason, insight_ids = [] } = req.body;
  if (!external_id || !text) return res.status(400).json({ error: 'external_id and text are required' });
  if (!DECISIONS.includes(decision)) {
    return res.status(400).json({ error: `decision must be one of: ${DECISIONS.join(', ')}` });
  }
  // A skipped document with no reason is the one part of the trace a person
  // can't reconstruct, so it is required.
  if (decision === 'no_insight' && !reason) return res.status(400).json({ error: 'reason is required for no_insight' });
  if (!Array.isArray(insight_ids)) return res.status(400).json({ error: 'insight_ids must be an array' });
  try {
    const run = await runningRun(req, res);
    if (!run) return;
    const ids = [...new Set(insight_ids.map(String))];
    const missing = await missingFromAccount('insights', ids, req.accountId);
    if (missing.length > 0) {
      return res.status(400).json({ error: `insight_ids not found in this account: ${missing.join(', ')}` });
    }
    const { rows } = await pool.query(
      `INSERT INTO collection_run_documents (account_id, run_id, external_id, title, text, decision, reason, insight_ids)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [req.accountId, run.id, external_id, title || null, text, decision, reason || null, ids]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// Closes the run with the collector's summary; the counts are worked out here
// from what it recorded rather than taken on its word.
router.post('/:runId/finish', async (req, res, next) => {
  const { status = 'succeeded', summary, error } = req.body;
  if (!['succeeded', 'failed'].includes(status)) {
    return res.status(400).json({ error: 'status must be succeeded or failed' });
  }
  try {
    const run = await runningRun(req, res);
    if (!run) return;
    await pool.query(
      `UPDATE collection_runs SET status = $1, summary = $2, error = $3, finished_at = now(),
         stats = (SELECT COALESCE(json_object_agg(decision, n), '{}')
                    FROM (SELECT decision, count(*)::int AS n FROM collection_run_documents
                           WHERE run_id = $4 GROUP BY decision) counts)
       WHERE id = $4`,
      [status, summary || null, error || null, run.id]
    );
    res.json(await fetchRun(run.id, req.accountId));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
