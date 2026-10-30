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
  // Transactions run on the same stand-in.
  async connect() {
    return { query: (sql, params) => db.query(sql, params), release() {} };
  },
};
const dbPath = path.join(__dirname, '../src/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: db };

const insightsRouter = require('../src/routes/insights');

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
  app.use('/insights', insightsRouter);
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => res.status(500).json({ error: err.message }));
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/insights`;
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
  return { status: res.status, body: await res.json() };
}

test('POST /:id/reopen sends a reviewed insight back to unvalidated', async () => {
  db.respond = (sql) => {
    if (/^UPDATE insights/.test(sql)) return { rowCount: 1 };
    return { rows: [{ id: 5, status: 'unvalidated' }] };
  };
  const res = await request('POST', '/5/reopen');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'unvalidated');
  const update = db.calls.find((call) => /^UPDATE insights/.test(call.sql));
  assert.match(update.sql, /status = 'unvalidated', reviewed_by = NULL, reviewed_at = NULL, rejection_reason = NULL, review_note = NULL/);
  assert.deepEqual(update.params, ['5', ACCOUNT_ID]);
});

test('POST /:id/reopen is 404 for an insight outside the account', async () => {
  const res = await request('POST', '/5/reopen');
  assert.equal(res.status, 404);
});

test('POST /:id/reopen is forbidden to the insight collector', async () => {
  role = 'collector';
  const res = await request('POST', '/5/reopen');
  assert.equal(res.status, 403);
  assert.equal(db.calls.length, 0);
});

test('POST / stores the sentiment', async () => {
  db.respond = (sql) => {
    if (/^INSERT INTO insights/.test(sql)) return { rows: [{ id: 9 }] };
    if (/^SELECT i\.\*/.test(sql)) return { rows: [{ id: 9, sentiment: 'negative' }] };
    return { rows: [] };
  };
  const res = await request('POST', '/', { name: 'Admins abandon setup at SSO', sentiment: 'negative' });
  assert.equal(res.status, 201);
  const insert = db.calls.find((call) => /^INSERT INTO insights/.test(call.sql));
  assert.match(insert.sql, /sentiment\)/);
  assert.equal(insert.params.at(-1), 'negative');
});

test('POST / leaves sentiment empty when none is given', async () => {
  db.respond = (sql) => (/^INSERT INTO insights/.test(sql) ? { rows: [{ id: 9 }] } : { rows: [] });
  await request('POST', '/', { name: 'Admins abandon setup at SSO' });
  const insert = db.calls.find((call) => /^INSERT INTO insights/.test(call.sql));
  assert.equal(insert.params.at(-1), null);
});

test('POST / rejects an unknown sentiment', async () => {
  const res = await request('POST', '/', { name: 'Admins abandon setup at SSO', sentiment: 'angry' });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /sentiment must be one of: positive, neutral, negative/);
  assert.equal(db.calls.length, 0);
});

test('POST / stores observed_at as a bare date at midnight UTC, or a timestamp as given', async () => {
  db.respond = (sql) => (/^INSERT INTO insights/.test(sql) ? { rows: [{ id: 9 }] } : { rows: [] });
  for (const [given, stored] of [
    ['2026-10-05', '2026-10-05T00:00:00Z'],
    ['2026-10-05T14:20:00.000Z', '2026-10-05T14:20:00.000Z'],
    ['2026-10-05T14:20:00+02:00', '2026-10-05T14:20:00+02:00'],
    ['', null],
  ]) {
    db.calls = [];
    const res = await request('POST', '/', { name: 'Admins abandon setup at SSO', observed_at: given });
    assert.equal(res.status, 201, given);
    const insert = db.calls.find((call) => /^INSERT INTO insights/.test(call.sql));
    assert.equal(insert.params[5], stored, given);
  }
});

test('POST / rejects an observed_at that is not a whole date', async () => {
  for (const given of ['2026-10', '2026', 'October 2026', '2026-02-30', '2026-13-01', 20261005]) {
    db.calls = [];
    const res = await request('POST', '/', { name: 'Admins abandon setup at SSO', observed_at: given });
    assert.equal(res.status, 400, String(given));
    assert.match(res.body.error, /observed_at must be a date \(YYYY-MM-DD\) or an ISO 8601 timestamp/);
    assert.equal(db.calls.length, 0, String(given));
  }
});

test('PUT /:id rejects a month-only observed_at', async () => {
  const res = await request('PUT', '/5', { name: 'Admins abandon setup at SSO', observed_at: '2026-10' });
  assert.equal(res.status, 400);
  assert.equal(db.calls.length, 0);
});

test('PUT /:id replaces the sentiment', async () => {
  db.respond = (sql) => (/^UPDATE insights/.test(sql) ? { rows: [{ id: 5 }], rowCount: 1 } : { rows: [{ id: 5, sentiment: 'positive' }] });
  const res = await request('PUT', '/5', { name: 'Admins love the new setup', sentiment: 'positive' });
  assert.equal(res.status, 200);
  const update = db.calls.find((call) => /^UPDATE insights/.test(call.sql));
  assert.match(update.sql, /sentiment = \$11/);
  assert.equal(update.params[10], 'positive');
});

test('PUT /:id updates the provenance fields it names and keeps the rest', async () => {
  db.respond = (sql) => (/^UPDATE insights/.test(sql) ? { rows: [{ id: 5 }], rowCount: 1 } : { rows: [{ id: 5 }] });
  const res = await request('PUT', '/5', { name: 'Admins love the new setup', source_system: ' Jira ', firsthand: false });
  assert.equal(res.status, 200);
  const updates = db.calls.filter((call) => /^UPDATE insights/.test(call.sql));
  assert.equal(updates.length, 2);
  assert.equal(updates[1].sql, 'UPDATE insights SET source_system = $3, firsthand = $4 WHERE id = $1 AND account_id = $2');
  assert.deepEqual(updates[1].params, [5, ACCOUNT_ID, 'Jira', false]);
});

test('PUT /:id leaves provenance alone when none is named', async () => {
  db.respond = (sql) => (/^UPDATE insights/.test(sql) ? { rows: [{ id: 5 }], rowCount: 1 } : { rows: [{ id: 5 }] });
  await request('PUT', '/5', { name: 'Admins love the new setup' });
  assert.equal(db.calls.filter((call) => /^UPDATE insights/.test(call.sql)).length, 1);
});

test('PUT /:id rejects a firsthand that is not true or false', async () => {
  const res = await request('PUT', '/5', { name: 'Admins love the new setup', firsthand: 'yes' });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /firsthand must be true or false/);
  assert.equal(db.calls.length, 0);
});
