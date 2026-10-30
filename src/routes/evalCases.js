const express = require('express');
const pool = require('../db');
const { documentFromRun, emptyExpected, draftFromReview, checkCase } = require('../lib/evalCases');

// The insight collector's eval set (product/agents/insight-collector/evals.md):
// documents with the answer it should give, which an eval runner scores a
// model or prompt version against. Cases are added from a run trace, drafted
// from review or left blank to label by hand, and finished here.
const router = express.Router({ mergeParams: true });

const LABEL_SOURCES = ['golden', 'review'];
const STATUSES = ['draft', 'ready'];
const SPLITS = ['dev', 'test'];
// The held-out share of the set (evals.md, "Keep a held-out set").
const TEST_SHARE = 0.3;

// The collector is graded against these, so it never sees them.
router.use((req, res, next) => {
  if (req.user.role === 'collector') return res.status(403).json({ error: 'the insight collector may not read its eval set' });
  next();
});

// Each case carries `problems`: what stops it being scored as it stands.
function withProblems(row) {
  const { shape, excerpts } = checkCase(row.document, row.expected);
  return { ...row, problems: [...shape, ...excerpts] };
}

async function fetchCase(executor, caseId, accountId) {
  const { rows } = await executor.query('SELECT * FROM eval_cases WHERE id = $1 AND account_id = $2', [caseId, accountId]);
  return rows[0] ? withProblems(rows[0]) : null;
}

// ?status=ready is what a runner scores; ?split=dev|test narrows to one split.
router.get('/', async (req, res, next) => {
  try {
    const { status, split } = req.query;
    if (status !== undefined && !STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${STATUSES.join(', ')}` });
    }
    if (split !== undefined && !SPLITS.includes(split)) {
      return res.status(400).json({ error: `split must be one of: ${SPLITS.join(', ')}` });
    }
    const { rows } = await pool.query(
      `SELECT * FROM eval_cases WHERE account_id = $1 AND ($2::text IS NULL OR status = $2)
         AND ($3::text IS NULL OR split = $3) ORDER BY id`,
      [req.accountId, status ?? null, split ?? null]
    );
    res.json(rows.map(withProblems));
  } catch (err) {
    next(err);
  }
});

router.get('/:caseId', async (req, res, next) => {
  try {
    const found = await fetchCase(pool, req.params.caseId, req.accountId);
    if (!found) return res.status(404).json({ error: 'eval case not found' });
    res.json(found);
  } catch (err) {
    next(err);
  }
});

// A name that reads like the case folders in LABELING.md
// (<set>-<source>-<what>), made unique within the account.
async function uniqueName(executor, accountId, base) {
  const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'case';
  const { rows } = await executor.query(
    `SELECT name FROM eval_cases WHERE account_id = $1 AND (name = $2 OR name LIKE $2 || '-%')`,
    [accountId, slug]
  );
  const taken = new Set(rows.map((row) => row.name));
  if (!taken.has(slug)) return slug;
  let n = 2;
  while (taken.has(`${slug}-${n}`)) n += 1;
  return `${slug}-${n}`;
}

// New cases go to the held-out split until it is TEST_SHARE of the set.
async function nextSplit(executor, accountId) {
  const { rows: [counts] } = await executor.query(
    `SELECT count(*)::int AS total, count(*) FILTER (WHERE split = 'test')::int AS test
       FROM eval_cases WHERE account_id = $1`,
    [accountId]
  );
  return (counts.test + 1) / (counts.total + 1) <= TEST_SHARE ? 'test' : 'dev';
}

// From a run trace: { run_document_id, label_source }. 'review' drafts the
// expected answer from what reviewers did with the document's suggestions;
// 'golden' leaves it blank, so it is labelled from the document alone
// (LABELING.md: never from the model's output). Or a case written elsewhere:
// { name, label_source, document, expected }.
router.post('/', async (req, res, next) => {
  const { run_document_id, label_source } = req.body;
  if (!LABEL_SOURCES.includes(label_source)) {
    return res.status(400).json({ error: `label_source must be one of: ${LABEL_SOURCES.join(', ')}` });
  }
  try {
    let draft;
    if (run_document_id !== undefined && run_document_id !== null) {
      draft = await draftFromRunDocument(req, res, run_document_id, label_source);
    } else {
      draft = readGivenCase(req, res);
    }
    if (!draft) return;

    const name = await uniqueName(pool, req.accountId, draft.name);
    const split = SPLITS.includes(req.body.split) ? req.body.split : await nextSplit(pool, req.accountId);
    const { rows } = await pool.query(
      `INSERT INTO eval_cases (account_id, name, label_source, status, split, document, expected, run_document_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (run_document_id, label_source) WHERE run_document_id IS NOT NULL DO NOTHING
       RETURNING id`,
      [
        req.accountId,
        name,
        label_source,
        draft.ready ? 'ready' : 'draft',
        split,
        JSON.stringify(draft.document),
        JSON.stringify(draft.expected),
        draft.runDocumentId ?? null,
        req.user.id,
      ]
    );
    if (rows.length === 0) {
      const { rows: existing } = await pool.query(
        'SELECT id FROM eval_cases WHERE run_document_id = $1 AND label_source = $2 AND account_id = $3',
        [draft.runDocumentId, label_source, req.accountId]
      );
      return res.status(409).json({ error: `this document is already in the ${label_source} set`, id: existing[0]?.id ?? null });
    }
    res.status(201).json(await fetchCase(pool, rows[0].id, req.accountId));
  } catch (err) {
    next(err);
  }
});

async function draftFromRunDocument(req, res, runDocumentId, labelSource) {
  const { rows: [doc] } = await pool.query(
    'SELECT * FROM collection_run_documents WHERE id = $1 AND account_id = $2',
    [runDocumentId, req.accountId]
  );
  if (!doc) {
    res.status(400).json({ error: 'run_document_id not found in this account' });
    return null;
  }
  const { rows: [run] } = await pool.query('SELECT * FROM collection_runs WHERE id = $1', [doc.run_id]);
  const { rows: insights } = await pool.query(
    `SELECT i.*,
            COALESCE((SELECT array_agg(io.outcome_id ORDER BY io.outcome_id) FROM insight_outcomes io WHERE io.insight_id = i.id), '{}') AS outcome_ids,
            COALESCE((SELECT array_agg(ip.project_id ORDER BY ip.project_id) FROM insight_projects ip WHERE ip.insight_id = i.id), '{}') AS project_ids
       FROM insights i WHERE i.id = ANY($1::bigint[]) AND i.account_id = $2 ORDER BY i.id`,
    [doc.insight_ids, req.accountId]
  );

  const document = documentFromRun(run, doc, insights);
  const name = `${labelSource}-${run.source_system}-${doc.external_id}`;
  if (labelSource === 'golden') {
    return { name, document, expected: emptyExpected(), ready: false, runDocumentId: doc.id };
  }
  const names = await linkNames(insights, req.accountId);
  const { expected, ready } = draftFromReview(doc, insights, names);
  return { name, document, expected, ready, runDocumentId: doc.id };
}

// 'outcome:<id>' / 'project:<id>' → name, for the outcomes and projects these
// insights link to.
async function linkNames(insights, accountId) {
  const names = {};
  for (const [kind, table, field] of [
    ['outcome', 'outcomes', 'outcome_ids'],
    ['project', 'projects', 'project_ids'],
  ]) {
    const ids = [...new Set(insights.flatMap((insight) => insight[field] ?? []).map(String))];
    if (ids.length === 0) continue;
    const { rows } = await pool.query(`SELECT id, name FROM ${table} WHERE id = ANY($1::bigint[]) AND account_id = $2`, [
      ids,
      accountId,
    ]);
    for (const row of rows) names[`${kind}:${row.id}`] = row.name;
  }
  return names;
}

function readGivenCase(req, res) {
  const { name, document, expected = emptyExpected() } = req.body;
  if (typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'name is required' });
    return null;
  }
  const { shape } = checkCase(document, expected);
  if (shape.length > 0) {
    res.status(400).json({ error: shape.join('; ') });
    return null;
  }
  return { name, document, expected, ready: false };
}

// Changes the fields named. Saving a draft only needs the right shape; marking
// a case ready also needs every expected excerpt to be in the document, so a
// runner never scores against a quote that isn't there.
router.put('/:caseId', async (req, res, next) => {
  try {
    const current = await fetchCase(pool, req.params.caseId, req.accountId);
    if (!current) return res.status(404).json({ error: 'eval case not found' });

    const updated = {
      name: req.body.name ?? current.name,
      status: req.body.status ?? current.status,
      split: req.body.split ?? current.split,
      document: req.body.document ?? current.document,
      expected: req.body.expected ?? current.expected,
    };
    if (typeof updated.name !== 'string' || !updated.name.trim()) return res.status(400).json({ error: 'name is required' });
    if (!STATUSES.includes(updated.status)) return res.status(400).json({ error: `status must be one of: ${STATUSES.join(', ')}` });
    if (!SPLITS.includes(updated.split)) return res.status(400).json({ error: `split must be one of: ${SPLITS.join(', ')}` });
    const { shape, excerpts } = checkCase(updated.document, updated.expected);
    if (shape.length > 0) return res.status(400).json({ error: shape.join('; ') });
    if (updated.status === 'ready' && excerpts.length > 0) {
      return res.status(400).json({ error: `not ready: ${excerpts.join('; ')}` });
    }

    await pool.query(
      `UPDATE eval_cases SET name = $1, status = $2, split = $3, document = $4, expected = $5, updated_at = now()
       WHERE id = $6 AND account_id = $7`,
      [updated.name.trim(), updated.status, updated.split, JSON.stringify(updated.document), JSON.stringify(updated.expected), current.id, req.accountId]
    );
    res.json(await fetchCase(pool, current.id, req.accountId));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'another case already has that name' });
    next(err);
  }
});

router.delete('/:caseId', async (req, res, next) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM eval_cases WHERE id = $1 AND account_id = $2', [
      req.params.caseId,
      req.accountId,
    ]);
    if (rowCount === 0) return res.status(404).json({ error: 'eval case not found' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
