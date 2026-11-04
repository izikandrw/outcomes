const { test, beforeEach, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');

// Stands in for src/db.js so the route runs without a database. Each test sets
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

const impactsRouter = require('../src/routes/impacts');

const ACCOUNT_ID = '7';
let server;
let baseUrl;

before(async () => {
  const app = express();
  app.use((req, res, next) => {
    req.accountId = ACCOUNT_ID;
    next();
  });
  app.use('/impacts', impactsRouter);
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => res.status(500).json({ error: err.message }));
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/impacts`;
});

after(() => new Promise((resolve) => server.close(resolve)));

beforeEach(() => {
  db.calls = [];
  db.respond = () => ({ rowCount: 1 });
});

const del = (id) => fetch(`${baseUrl}/${id}`, { method: 'DELETE' });

test('DELETE keeps child impacts and linked outcomes, detaching them before the impact goes', async () => {
  const res = await del(5);

  assert.equal(res.status, 204);
  const writes = db.calls.filter((call) => /^(UPDATE|DELETE)/.test(call.sql));
  assert.match(writes[0].sql, /^UPDATE impacts SET parent_impact_id = NULL, .* WHERE parent_impact_id = \$1 AND account_id = \$2/);
  assert.match(writes[1].sql, /^UPDATE outcomes SET impact_id = NULL, .* WHERE impact_id = \$1 AND account_id = \$2/);
  assert.match(writes[2].sql, /^DELETE FROM measurements/);
  assert.match(writes[3].sql, /^DELETE FROM targets WHERE impact_id = \$1/);
  assert.match(writes[4].sql, /^DELETE FROM impacts WHERE id = \$1 AND account_id = \$2/);
  for (const write of writes) assert.deepEqual(write.params, ['5', ACCOUNT_ID]);
  assert.equal(db.calls[0].sql, 'BEGIN');
  assert.equal(db.calls.at(-2).sql, 'COMMIT');
});

test('DELETE puts the children back when the impact cannot be deleted', async () => {
  db.respond = (sql) => {
    if (/^DELETE FROM impacts/.test(sql)) throw Object.assign(new Error('blocked'), { code: '23503' });
    return { rowCount: 1 };
  };

  const res = await del(5);

  assert.equal(res.status, 500); // this test app's handler; app.js maps 23503 to a 409
  assert.equal(db.calls.at(-2).sql, 'ROLLBACK');
  assert.ok(!db.calls.some((call) => call.sql === 'COMMIT'));
});

test('DELETE 404s when the impact is not in the account', async () => {
  db.respond = () => ({ rowCount: 0 });

  const res = await del(99);

  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: 'impact not found' });
});
