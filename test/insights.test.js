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

async function request(method, urlPath) {
  const res = await fetch(`${baseUrl}${urlPath}`, { method });
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
