const { test, beforeEach, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');

// Stands in for src/db.js so the routes run without a database. Each test sets
// `respond` to answer queries by their SQL; every query lands in `calls`.
const db = {
  calls: [],
  respond: () => ({ rows: [], rowCount: 0 }),
  async query(sql, params) {
    const flat = sql.replace(/\s+/g, ' ').trim();
    db.calls.push({ sql: flat, params });
    const result = await db.respond(flat, params);
    return { rows: [], rowCount: 0, ...result };
  },
  async connect() {
    return { query: db.query, release: () => db.calls.push({ sql: 'RELEASE' }) };
  },
};
const dbPath = path.join(__dirname, '../src/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: db };

const outcomesRouter = require('../src/routes/outcomes');

const ACCOUNT_ID = '7';
let server;
let baseUrl;

before(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.accountId = ACCOUNT_ID;
    req.user = { id: 3, role: 'member' };
    next();
  });
  app.use('/outcomes', outcomesRouter);
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => res.status(500).json({ error: err.message }));
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/outcomes`;
});

after(() => new Promise((resolve) => server.close(resolve)));

beforeEach(() => {
  db.calls = [];
  db.respond = () => ({ rows: [], rowCount: 0 });
});

async function request(method, urlPath, body) {
  const res = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: res.status === 204 ? null : await res.json() };
}

const sqls = () => db.calls.map((call) => call.sql);
const callMatching = (pattern) => db.calls.find((call) => pattern.test(call.sql));

// Answers every reference lookup as found, except ids listed in `missing`
// (keyed by table), and serves `outcome` from the SELECT that reads one back.
function fakeAccount({ missing = {}, outcome = { id: 1 }, insertedId = 1, updatedRows } = {}) {
  return (sql, params) => {
    const table = sql.match(/^SELECT id FROM (\w+) WHERE id = \$1/)?.[1];
    if (table) return { rows: (missing[table] ?? []).includes(params[0]) ? [] : [{ id: params[0] }] };
    const anyTable = sql.match(/^SELECT id FROM (\w+) WHERE id = ANY/)?.[1];
    if (anyTable) {
      return { rows: params[0].filter((id) => !(missing[anyTable] ?? []).includes(id)).map((id) => ({ id })) };
    }
    if (/^INSERT INTO outcomes/.test(sql)) return { rows: [{ id: insertedId }] };
    if (/^UPDATE outcomes/.test(sql)) return { rows: updatedRows ?? [{ id: insertedId }] };
    if (/FROM outcomes o/.test(sql)) return { rows: outcome ? [outcome] : [] };
    return {};
  };
}

test('GET / lists the account’s outcomes', async () => {
  const outcomes = [
    { id: 1, name: 'Faster onboarding', project_ids: ['3'] },
    { id: 2, name: 'Fewer churned accounts', project_ids: [] },
  ];
  db.respond = () => ({ rows: outcomes });

  const res = await request('GET', '/');

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, outcomes);
  assert.equal(db.calls.length, 1);
  assert.match(db.calls[0].sql, /WHERE o.account_id = \$1 GROUP BY o.id ORDER BY o.id/);
  assert.deepEqual(db.calls[0].params, [ACCOUNT_ID]);
});

test('GET /:id returns the outcome scoped to the account', async () => {
  db.respond = () => ({ rows: [{ id: 5, name: 'Faster onboarding' }] });

  const res = await request('GET', '/5');

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { id: 5, name: 'Faster onboarding' });
  assert.deepEqual(db.calls[0].params, ['5', ACCOUNT_ID]);
});

test('GET /:id 404s when the outcome is not in the account', async () => {
  const res = await request('GET', '/99');

  assert.equal(res.status, 404);
  assert.deepEqual(res.body, { error: 'outcome not found' });
});

test('GET / passes database errors to the error handler', async () => {
  db.respond = () => {
    throw new Error('connection lost');
  };

  const res = await request('GET', '/');

  assert.equal(res.status, 500);
  assert.deepEqual(res.body, { error: 'connection lost' });
});

test('POST / creates an outcome, links projects, and returns it', async () => {
  const created = { id: 11, name: 'Faster onboarding', project_ids: ['3', '4'] };
  db.respond = fakeAccount({ insertedId: 11, outcome: created });

  const res = await request('POST', '/', {
    name: 'Faster onboarding',
    description: 'Get teams live in a day',
    team_id: 2,
    project_ids: [3, 4, 3],
  });

  assert.equal(res.status, 201);
  assert.deepEqual(res.body, created);
  assert.deepEqual(callMatching(/^INSERT INTO outcomes/).params, [
    ACCOUNT_ID,
    2,
    null,
    null,
    null,
    'Faster onboarding',
    'Get teams live in a day',
  ]);
  assert.deepEqual(callMatching(/^DELETE FROM project_outcomes/).params, [11, ACCOUNT_ID]);
  // Duplicate project ids are linked once.
  assert.deepEqual(callMatching(/^INSERT INTO project_outcomes/).params, [ACCOUNT_ID, ['3', '4'], 11]);
  const order = sqls();
  assert.ok(order.indexOf('BEGIN') < order.findIndex((sql) => sql.startsWith('INSERT INTO outcomes')));
  assert.ok(order.indexOf('COMMIT') > order.findIndex((sql) => sql.startsWith('INSERT INTO project_outcomes')));
  assert.ok(order.includes('RELEASE'));
});

test('POST / leaves project links alone when project_ids is omitted', async () => {
  db.respond = fakeAccount();

  const res = await request('POST', '/', { name: 'Faster onboarding', team_id: 2 });

  assert.equal(res.status, 201);
  assert.equal(callMatching(/project_outcomes WHERE outcome_id/), undefined);
  assert.equal(callMatching(/^INSERT INTO project_outcomes/), undefined);
});

test('POST / with an empty project_ids clears links without inserting any', async () => {
  db.respond = fakeAccount();

  const res = await request('POST', '/', { name: 'Faster onboarding', team_id: 2, project_ids: [] });

  assert.equal(res.status, 201);
  assert.ok(callMatching(/^DELETE FROM project_outcomes/));
  assert.equal(callMatching(/^INSERT INTO project_outcomes/), undefined);
});

test('POST / creates an outcome without a team', async () => {
  db.respond = fakeAccount();

  const res = await request('POST', '/', { name: 'Faster onboarding' });

  assert.equal(res.status, 201);
  assert.equal(callMatching(/^SELECT id FROM teams/), undefined);
  assert.equal(callMatching(/^INSERT INTO outcomes/).params[1], null);
});

test('PUT /:id clears the team when team_id is omitted', async () => {
  db.respond = fakeAccount();

  const res = await request('PUT', '/1', { name: 'Faster onboarding' });

  assert.equal(res.status, 200);
  assert.equal(callMatching(/^UPDATE outcomes/).params[2], null);
});

test('POST / stores optional refs when they belong to the account', async () => {
  db.respond = fakeAccount();

  const res = await request('POST', '/', {
    name: 'Faster onboarding',
    team_id: 2,
    project_id: 3,
    impact_id: 9,
  });

  assert.equal(res.status, 201);
  assert.deepEqual(callMatching(/^INSERT INTO outcomes/).params.slice(1, 5), [2, 3, null, 9]);
});

const validationCases = [
  { label: 'name is missing', body: { team_id: 2 }, error: 'name is required' },
  {
    label: 'team_id is from another account',
    body: { name: 'X', team_id: 2 },
    missing: { teams: [2] },
    error: 'team_id not found in this account',
  },
  {
    label: 'project_id is from another account',
    body: { name: 'X', team_id: 2, project_id: 3 },
    missing: { projects: [3] },
    error: 'project_id not found in this account',
  },
  {
    label: 'parent_outcome_id is from another account',
    body: { name: 'X', team_id: 2, parent_outcome_id: 4 },
    missing: { outcomes: [4] },
    error: 'parent_outcome_id not found in this account',
  },
  {
    label: 'impact_id is set on a child outcome',
    body: { name: 'X', team_id: 2, parent_outcome_id: 4, impact_id: 9 },
    error: 'impact_id can only be set on a top-level outcome',
  },
  {
    label: 'impact_id is from another account',
    body: { name: 'X', team_id: 2, impact_id: 9 },
    missing: { impacts: [9] },
    error: 'impact_id not found in this account',
  },
  {
    label: 'project_ids is not an array',
    body: { name: 'X', team_id: 2, project_ids: '3' },
    error: 'project_ids must be an array',
  },
  {
    label: 'project_ids names projects from another account',
    body: { name: 'X', team_id: 2, project_ids: [3, 5, 6] },
    missing: { projects: ['5', '6'] },
    error: 'project_ids not found in this account: 5, 6',
  },
];

for (const method of ['POST', 'PUT']) {
  for (const { label, body, missing, error } of validationCases) {
    test(`${method} rejects the request when ${label}`, async () => {
      db.respond = fakeAccount({ missing });

      const res = await request(method, method === 'POST' ? '/' : '/1', body);

      assert.equal(res.status, 400);
      assert.deepEqual(res.body, { error });
      assert.ok(!sqls().includes('BEGIN'), 'nothing is written');
    });
  }
}

test('POST / rolls back and releases the client when a write fails', async () => {
  const respond = fakeAccount();
  db.respond = (sql, params) => {
    if (/^INSERT INTO project_outcomes/.test(sql)) throw new Error('link failed');
    return respond(sql, params);
  };

  const res = await request('POST', '/', { name: 'X', team_id: 2, project_ids: [3] });

  assert.equal(res.status, 500);
  assert.ok(sqls().includes('ROLLBACK'));
  assert.ok(!sqls().includes('COMMIT'));
  assert.ok(sqls().includes('RELEASE'));
});

test('PUT /:id updates the outcome, replaces links, and returns it', async () => {
  const updated = { id: 5, name: 'Faster onboarding', project_ids: ['8'] };
  db.respond = fakeAccount({ insertedId: 5, outcome: updated });

  const res = await request('PUT', '/5', {
    name: 'Faster onboarding',
    team_id: 2,
    parent_outcome_id: 4,
    project_ids: [8],
  });

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, updated);
  assert.deepEqual(callMatching(/^UPDATE outcomes/).params, [
    'Faster onboarding',
    null,
    2,
    null,
    4,
    null,
    '5',
    ACCOUNT_ID,
  ]);
  assert.deepEqual(callMatching(/^INSERT INTO project_outcomes/).params, [ACCOUNT_ID, ['8'], 5]);
  assert.ok(sqls().includes('COMMIT'));
});

test('PUT /:id 404s and rolls back when the outcome is not in the account', async () => {
  db.respond = fakeAccount({ updatedRows: [] });

  const res = await request('PUT', '/99', { name: 'X', team_id: 2, project_ids: [3] });

  assert.equal(res.status, 404);
  assert.deepEqual(res.body, { error: 'outcome not found' });
  assert.ok(sqls().includes('ROLLBACK'));
  assert.equal(callMatching(/project_outcomes WHERE outcome_id/), undefined);
  assert.ok(sqls().includes('RELEASE'));
});

test('DELETE /:id deletes the outcome scoped to the account', async () => {
  db.respond = () => ({ rowCount: 1 });

  const res = await request('DELETE', '/5');

  assert.equal(res.status, 204);
  assert.match(db.calls[0].sql, /^DELETE FROM outcomes WHERE id = \$1 AND account_id = \$2/);
  assert.deepEqual(db.calls[0].params, ['5', ACCOUNT_ID]);
});

test('DELETE /:id 404s when the outcome is not in the account', async () => {
  const res = await request('DELETE', '/99');

  assert.equal(res.status, 404);
  assert.deepEqual(res.body, { error: 'outcome not found' });
});

// Serves redundantLinks() its rows: `before` on the read taken before the
// write, `after` on the one taken after it.
function withRedundantLinks({ before = [], after = [] }, respond = fakeAccount({ insertedId: 5 })) {
  let reads = 0;
  return (sql, params) => {
    if (/^WITH RECURSIVE lineage/.test(sql)) return { rows: reads++ === 0 ? before : after };
    return respond(sql, params);
  };
}

const redundant = {
  project_id: '8',
  project_name: 'Cooldown on new versions',
  outcome_id: '6',
  outcome_name: 'Agents see why an input was blocked',
  ancestor_id: '5',
  ancestor_name: 'Agents build against verified inputs',
};

test('PUT /:id rejects linking a project already carried by a child outcome', async () => {
  db.respond = withRedundantLinks({ after: [redundant] });

  const res = await request('PUT', '/5', { name: 'X', project_ids: [8] });

  assert.equal(res.status, 400);
  assert.match(res.body.error, /"Cooldown on new versions" already rolls up to "Agents build against verified inputs"/);
  assert.ok(sqls().includes('ROLLBACK'));
  assert.ok(!sqls().includes('COMMIT'));
  assert.ok(sqls().includes('RELEASE'));
});

test('PUT /:id rejects a new parent that already links to one of its projects', async () => {
  db.respond = withRedundantLinks({ after: [redundant] });

  const res = await request('PUT', '/6', { name: 'X', parent_outcome_id: 5 });

  assert.equal(res.status, 400);
  assert.ok(sqls().includes('ROLLBACK'));
});

test('PUT /:id still saves when a redundant link was already there', async () => {
  db.respond = withRedundantLinks({ before: [redundant], after: [redundant] });

  const res = await request('PUT', '/5', { name: 'Renamed', project_ids: [8] });

  assert.equal(res.status, 200);
  assert.ok(sqls().includes('COMMIT'));
});

test('PUT /:id rejects making an outcome its own parent', async () => {
  db.respond = fakeAccount();

  const res = await request('PUT', '/5', { name: 'X', parent_outcome_id: 5 });

  assert.equal(res.status, 400);
  assert.deepEqual(res.body, { error: 'parent_outcome_id would make an outcome its own ancestor' });
  assert.ok(!sqls().includes('BEGIN'), 'nothing is written');
});

test('PUT /:id rejects a parent that sits beneath the outcome', async () => {
  const respond = fakeAccount();
  db.respond = (sql, params) =>
    /^WITH RECURSIVE ancestors/.test(sql) ? { rows: [{ found: 1 }] } : respond(sql, params);

  const res = await request('PUT', '/5', { name: 'X', parent_outcome_id: 6 });

  assert.equal(res.status, 400);
  assert.deepEqual(res.body, { error: 'parent_outcome_id would make an outcome its own ancestor' });
  assert.deepEqual(callMatching(/^WITH RECURSIVE ancestors/).params, [6, '5']);
});
