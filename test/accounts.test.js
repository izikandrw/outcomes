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

const accountsRouter = require('../src/routes/accounts');

const ACCOUNT_ID = '7';
const LOGO = 'data:image/png;base64,iVBORw0KGgo=';
let role = 'admin';
let server;
let baseUrl;

before(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.user = { id: 1, email: 'a@example.com', role, accountId: ACCOUNT_ID };
    next();
  });
  app.use('/accounts', accountsRouter);
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => res.status(500).json({ error: err.message }));
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}/accounts`;
});

after(() => new Promise((resolve) => server.close(resolve)));

beforeEach(() => {
  role = 'admin';
  db.calls = [];
  db.respond = (sql, params) =>
    /^UPDATE accounts/.test(sql) ? { rows: [{ id: params[1], name: params[0], logo: params[3] }] } : {};
});

async function request(method, urlPath, body) {
  const res = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}

const update = () => db.calls.find((call) => /^UPDATE accounts/.test(call.sql));

test('PUT /:id sets the account’s logo', async () => {
  const res = await request('PUT', `/${ACCOUNT_ID}`, { name: 'Acme', logo: LOGO });

  assert.equal(res.status, 200);
  assert.equal(res.body.logo, LOGO);
  assert.deepEqual(update().params, ['Acme', ACCOUNT_ID, true, LOGO]);
});

test('PUT /:id with a null logo removes it', async () => {
  const res = await request('PUT', `/${ACCOUNT_ID}`, { name: 'Acme', logo: null });

  assert.equal(res.status, 200);
  assert.deepEqual(update().params, ['Acme', ACCOUNT_ID, true, null]);
});

test('PUT /:id without a logo keeps the current one', async () => {
  const res = await request('PUT', `/${ACCOUNT_ID}`, { name: 'Acme' });

  assert.equal(res.status, 200);
  assert.deepEqual(update().params, ['Acme', ACCOUNT_ID, false, null]);
});

test('PUT /:id rejects a logo that is not a small image data URL', async () => {
  for (const logo of ['https://example.com/logo.png', 'data:image/svg+xml;base64,PHN2Zz4=', `${LOGO}${'A'.repeat(100000)}`]) {
    const res = await request('PUT', `/${ACCOUNT_ID}`, { name: 'Acme', logo });
    assert.equal(res.status, 400);
  }
  assert.equal(update(), undefined);
});

test('PUT /:id is admin only', async () => {
  role = 'member';
  const res = await request('PUT', `/${ACCOUNT_ID}`, { name: 'Acme', logo: LOGO });

  assert.equal(res.status, 403);
  assert.equal(update(), undefined);
});

test('PUT /:id on another account is not found', async () => {
  const res = await request('PUT', '/8', { name: 'Acme', logo: LOGO });

  assert.equal(res.status, 404);
  assert.equal(update(), undefined);
});
