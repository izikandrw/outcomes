const { test, beforeEach, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');
const { draftFromReview, checkCase } = require('../src/lib/evalCases');

// Stands in for src/db.js, as in insights.test.js.
const db = {
  calls: [],
  respond: () => ({ rows: [], rowCount: 0 }),
  async query(sql, params) {
    const flat = sql.replace(/\s+/g, ' ').trim();
    db.calls.push({ sql: flat, params });
    const result = await db.respond(flat, params);
    return { rows: [], rowCount: 0, ...result };
  },
};
const dbPath = path.join(__dirname, '../src/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: db };

const evalCasesRouter = require('../src/routes/evalCases');

const ACCOUNT_ID = '7';
let role = 'member';
let server;
let baseUrl;

before(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.accountId = ACCOUNT_ID;
    req.user = { id: 3, role };
    next();
  });
  app.use('/eval-cases', evalCasesRouter);
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => res.status(500).json({ error: err.message }));
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/eval-cases`;
});

after(() => new Promise((resolve) => server.close(resolve)));

beforeEach(() => {
  db.calls = [];
  db.respond = () => ({ rows: [], rowCount: 0 });
  role = 'member';
});

async function request(method, urlPath, body) {
  const res = await fetch(`${baseUrl}${urlPath}`, {
    method,
    ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: res.status === 204 ? null : await res.json() };
}

const TEXT = 'Priya: Honestly we gave up on SSO after two days. Rep: I think SSO is confusing for everyone.';

test('a review draft expects what reviewers approved, as they left it', () => {
  const { expected, ready } = draftFromReview({ decision: 'suggested' }, [
    {
      id: 1,
      status: 'validated',
      name: 'Globex abandoned SSO setup after two days',
      source_excerpt: 'we gave up on SSO after two days',
      type: 'sales_call',
      sentiment: 'negative',
      firsthand: true,
      dollar_impact: '4000.00',
      outcome_ids: ['12'],
      project_ids: [],
      proposed_links: [{ kind: 'project', name: 'SSO errors', rationale: 'r' }],
    },
  ], { 'outcome:12': 'Admins finish SSO setup' });
  assert.equal(ready, true);
  assert.deepEqual(expected.insights, [
    {
      excerpt: 'we gave up on SSO after two days',
      name: 'Globex abandoned SSO setup after two days',
      type: 'sales_call',
      sentiment: 'negative',
      firsthand: true,
      dollar_impact: 4000,
      links: [{ kind: 'outcome', id: '12', name: 'Admins finish SSO setup' }],
      proposed: [{ kind: 'project', name: 'SSO errors' }],
    },
  ]);
  assert.deepEqual(expected.not_insights, []);
});

test('a review draft names what was rejected as not an insight, and leaves judgment calls to a person', () => {
  const { expected, ready } = draftFromReview({ decision: 'suggested' }, [
    { id: 1, status: 'rejected', rejection_reason: 'not_an_insight', review_note: 'rep opinion', name: 'SSO is confusing', source_excerpt: 'I think SSO is confusing' },
    { id: 2, status: 'rejected', rejection_reason: 'duplicate', name: 'Dup' },
    { id: 3, status: 'unvalidated', name: 'Waiting' },
  ], {});
  assert.equal(ready, false);
  assert.deepEqual(expected.not_insights, [
    { excerpt: 'I think SSO is confusing', name: 'SSO is confusing', reason: 'not_an_insight', note: 'rep opinion' },
  ]);
  assert.match(expected.notes, /“Dup” \(#2\) is rejected as duplicate/);
  assert.match(expected.notes, /“Waiting” \(#3\) is not reviewed yet/);
});

test('a skipped document drafts as no insights, to be checked by a person', () => {
  const { expected, ready } = draftFromReview({ decision: 'no_insight', reason: 'password reset' }, [], {});
  assert.equal(ready, false);
  assert.deepEqual(expected.insights, []);
  assert.match(expected.notes, /password reset/);
  assert.deepEqual(expected.tags, ['no-insight']);
});

test('checkCase finds excerpts ignoring whitespace, curly quotes and case, and names the missing ones', () => {
  const document = { text: TEXT };
  assert.deepEqual(checkCase(document, { insights: [{ excerpt: 'WE GAVE  up on SSO' }] }), { shape: [], unready: [] });
  assert.deepEqual(checkCase(document, { insights: [{ excerpt: 'we loved SSO' }, {}] }).unready, [
    "expected.insights[0]'s excerpt isn't in the document",
    'expected.insights[1] needs an excerpt',
  ]);
  assert.deepEqual(checkCase({ text: '' }, { insights: 'x' }).shape, ['document needs its text', 'expected.insights must be a list']);
});

test('checkCase holds expected links to the case\'s frozen catalog', () => {
  const expected = { insights: [{ excerpt: 'we gave up on SSO', links: [{ kind: 'outcome', id: '12', name: 'SSO' }, { kind: 'project', id: '3' }] }] };
  const catalog = { outcomes: [{ id: '12', name: 'SSO' }], projects: [] };
  assert.deepEqual(checkCase({ text: TEXT }, expected, catalog).unready, [
    "expected.insights[0] links to project 3, which isn't in this case's catalog",
  ]);
});

test('the collector may not read the eval set', async () => {
  role = 'collector';
  const res = await request('GET', '/');
  assert.equal(res.status, 403);
  assert.equal(db.calls.length, 0);
});

test('POST / from a run document drafts a golden case with a blank answer', async () => {
  db.respond = (sql) => {
    if (/^SELECT \* FROM collection_run_documents/.test(sql)) {
      return { rows: [{ id: 40, run_id: 8, external_id: 'Globex call', title: 'Globex call', text: TEXT, decision: 'suggested', insight_ids: [1] }] };
    }
    if (/^SELECT \* FROM collection_runs/.test(sql)) return { rows: [{ id: 8, source_system: 'attention' }] };
    if (/FROM insights i/.test(sql)) return { rows: [{ id: 1, status: 'validated', name: 'x', source_excerpt: 'we gave up', source_url: 'https://a/1' }] };
    if (/^SELECT count/.test(sql)) return { rows: [{ total: 0, test: 0 }] };
    if (/^INSERT INTO eval_cases/.test(sql)) return { rows: [{ id: 5 }] };
    if (/^SELECT \* FROM eval_cases/.test(sql)) return { rows: [{ id: 5, document: { text: TEXT }, expected: { insights: [] } }] };
    return { rows: [] };
  };
  const res = await request('POST', '/', { run_document_id: 40, label_source: 'golden' });
  assert.equal(res.status, 201);
  const insert = db.calls.find((call) => /^INSERT INTO eval_cases/.test(call.sql));
  const [, name, labelSource, status, split, document, expected, runDocumentId] = insert.params;
  assert.equal(name, 'golden-attention-globex-call');
  assert.deepEqual([labelSource, status, split, runDocumentId], ['golden', 'draft', 'dev', 40]);
  assert.equal(JSON.parse(document).url, 'https://a/1');
  assert.deepEqual(JSON.parse(expected).insights, []);
});

test('POST / is 409 when the document is already in that set', async () => {
  db.respond = (sql) => {
    if (/^SELECT \* FROM collection_run_documents/.test(sql)) {
      return { rows: [{ id: 40, run_id: 8, external_id: 'row 2', text: TEXT, decision: 'no_insight', insight_ids: [] }] };
    }
    if (/^SELECT \* FROM collection_runs/.test(sql)) return { rows: [{ id: 8, source_system: 'csv' }] };
    if (/^SELECT count/.test(sql)) return { rows: [{ total: 3, test: 0 }] };
    if (/^SELECT id FROM eval_cases/.test(sql)) return { rows: [{ id: 11 }] };
    return { rows: [] };
  };
  const res = await request('POST', '/', { run_document_id: 40, label_source: 'review' });
  assert.equal(res.status, 409);
  assert.equal(res.body.id, 11);
  // With three dev cases and no test ones, the fourth goes to test.
  assert.equal(db.calls.find((call) => /^INSERT INTO eval_cases/.test(call.sql)).params[4], 'test');
});

test('PUT /:id refuses to mark a case ready while an expected excerpt is not in the document', async () => {
  db.respond = (sql) =>
    /^SELECT \* FROM eval_cases/.test(sql)
      ? { rows: [{ id: 5, name: 'c', status: 'draft', split: 'dev', document: { text: TEXT }, expected: { insights: [] } }] }
      : { rows: [] };
  const res = await request('PUT', '/5', { status: 'ready', expected: { insights: [{ excerpt: 'not there' }] } });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /not ready: expected.insights\[0\]'s excerpt isn't in the document/);
  assert.equal(db.calls.filter((call) => /^UPDATE/.test(call.sql)).length, 0);
});

test('PUT /:id saves a draft whose excerpts are still being fixed', async () => {
  db.respond = (sql) =>
    /^SELECT \* FROM eval_cases/.test(sql)
      ? { rows: [{ id: 5, name: 'c', status: 'draft', split: 'dev', document: { text: TEXT }, expected: { insights: [] } }] }
      : { rows: [], rowCount: 1 };
  const res = await request('PUT', '/5', { expected: { insights: [{ excerpt: 'not there' }] } });
  assert.equal(res.status, 200);
  const update = db.calls.find((call) => /^UPDATE eval_cases/.test(call.sql));
  assert.deepEqual(JSON.parse(update.params[4]), { insights: [{ excerpt: 'not there' }] });
});

// The account's current outcomes and projects, as snapshotCatalog reads them.
const liveCatalog = (sql) => {
  if (/^SELECT id, name, description FROM outcomes/.test(sql)) return { rows: [{ id: 12, name: 'Admins finish SSO setup', description: null }] };
  if (/^SELECT id, name, description FROM projects/.test(sql)) return { rows: [] };
  return null;
};

test('POST / freezes the account’s current catalog with the new case', async () => {
  db.respond = (sql) =>
    liveCatalog(sql) ??
    (/^SELECT count/.test(sql)
      ? { rows: [{ total: 0, test: 0 }] }
      : /^INSERT INTO eval_cases/.test(sql)
        ? { rows: [{ id: 6 }] }
        : { rows: [] });
  await request('POST', '/', { label_source: 'golden', name: 'hand-made', document: { text: TEXT } });
  const insert = db.calls.find((call) => /^INSERT INTO eval_cases/.test(call.sql));
  assert.deepEqual(JSON.parse(insert.params[9]), {
    outcomes: [{ id: '12', name: 'Admins finish SSO setup', description: null }],
    projects: [],
  });
});

test('PUT /:id with refresh_catalog replaces the frozen catalog, so a link to a new outcome can be marked ready', async () => {
  const stale = { outcomes: [], projects: [] };
  db.respond = (sql) =>
    liveCatalog(sql) ??
    (/^SELECT \* FROM eval_cases/.test(sql)
      ? { rows: [{ id: 5, name: 'c', status: 'draft', split: 'dev', document: { text: TEXT }, expected: { insights: [] }, catalog: stale }] }
      : { rows: [], rowCount: 1 });
  const expected = { insights: [{ excerpt: 'we gave up on SSO', links: [{ kind: 'outcome', id: '12' }] }] };

  const refused = await request('PUT', '/5', { status: 'ready', expected });
  assert.equal(refused.status, 400);
  assert.match(refused.body.error, /links to outcome 12, which isn't in this case's catalog/);

  db.calls = [];
  const res = await request('PUT', '/5', { status: 'ready', expected, refresh_catalog: true });
  assert.equal(res.status, 200);
  const update = db.calls.find((call) => /^UPDATE eval_cases/.test(call.sql));
  assert.deepEqual(JSON.parse(update.params[7]).outcomes.map((o) => o.id), ['12']);
});
