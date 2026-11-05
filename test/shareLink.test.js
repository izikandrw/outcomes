const { test, beforeEach, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const express = require('express');

// Stands in for src/db.js so the routes run without a database.
const db = {
  respond: () => ({ rows: [] }),
  async query(sql, params) {
    return { rows: [], rowCount: 0, ...(await db.respond(sql.replace(/\s+/g, ' ').trim(), params)) };
  },
};
const dbPath = path.join(__dirname, '../src/db.js');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: db };
process.env.JWT_SECRET ||= 'test-secret';

const authRouter = require('../src/routes/auth');
const usersRouter = require('../src/routes/users');
const { listEvents } = require('../src/lib/insightEvents');

const TOKEN = 'a'.repeat(40);
const GUEST = { id: 12, email: 'guest@outcomes.invalid', role: 'member', account_id: '7', account_name: 'chainguard 3', account_logo: null };
let viewer;
let server;
let base;

before(async () => {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRouter);
  app.use('/accounts/:accountId', (req, res, next) => {
    req.user = viewer;
    req.accountId = req.params.accountId;
    next();
  }, usersRouter);
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

beforeEach(() => {
  process.env.SHARE_LINK_TOKEN = TOKEN;
  process.env.SHARE_LINK_USER_ID = String(GUEST.id);
  viewer = { id: GUEST.id, email: GUEST.email, role: 'member', accountId: '7' };
  // The route's query only returns members, so this answers the way it would.
  db.respond = (sql, params) =>
    sql.includes("u.role = 'member'") && String(params[0]) === String(GUEST.id) ? { rows: [GUEST] } : { rows: [] };
});

const open = (token) => fetch(`${base}/auth/share/${token}`, { method: 'POST' });

test('the right token signs in as the guest, into their account', async () => {
  const res = await open(TOKEN);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.token);
  assert.equal(body.user.id, GUEST.id);
  assert.equal(body.account.id, '7');
});

test('a wrong token is refused', async () => {
  assert.equal((await open('b'.repeat(40))).status, 404);
});

test('the link is off unless both env vars are set, and a short token does not count', async () => {
  delete process.env.SHARE_LINK_USER_ID;
  assert.equal((await open(TOKEN)).status, 404);
  process.env.SHARE_LINK_USER_ID = String(GUEST.id);
  delete process.env.SHARE_LINK_TOKEN;
  assert.equal((await open('undefined')).status, 404);
  process.env.SHARE_LINK_TOKEN = 'short';
  assert.equal((await open('short')).status, 404);
});

test('a user id that is not a member gets no session, so the link cannot hand out an admin', async () => {
  process.env.SHARE_LINK_USER_ID = '1';
  assert.equal((await open(TOKEN)).status, 404);
});

test("the guest cannot list the account's users, anyone else can", async () => {
  db.respond = () => ({ rows: [{ id: 1, email: 'owner@example.com' }] });
  assert.equal((await fetch(`${base}/accounts/7/users`)).status, 403);
  viewer = { id: 1, email: 'owner@example.com', role: 'member', accountId: '7' };
  assert.equal((await fetch(`${base}/accounts/7/users`)).status, 200);
});

test("insight history hides other people's emails from the guest only", async () => {
  const rows = [
    { id: 1, actor_id: 1, actor_email: 'owner@example.com' },
    { id: 2, actor_id: GUEST.id, actor_email: GUEST.email },
  ];
  const executor = { query: async () => ({ rows }) };
  const seenByGuest = await listEvents(executor, '7', [1], viewer);
  assert.deepEqual(seenByGuest.map((row) => row.actor_email), [null, GUEST.email]);
  const seenByOwner = await listEvents(executor, '7', [1], { id: 1 });
  assert.deepEqual(seenByOwner.map((row) => row.actor_email), ['owner@example.com', GUEST.email]);
});
