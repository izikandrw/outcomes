const { test } = require('node:test');
const assert = require('node:assert/strict');
const { adoptProposals } = require('../src/lib/adoptProposals');

// A client that answers adoptProposals' queries from fixed rows and records
// every query it is sent.
function fakeClient({ insights, outcomes = [], projects = [] }) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      const flat = sql.replace(/\s+/g, ' ').trim();
      calls.push({ sql: flat, params });
      if (/^SELECT id, proposed_links FROM insights/.test(flat)) return { rows: insights };
      if (/FROM outcomes/.test(flat)) return { rows: outcomes };
      if (/FROM projects/.test(flat)) return { rows: projects };
      return { rows: [], rowCount: 1 };
    },
  };
}

test('a proposal naming an existing outcome becomes a link and is dropped', async () => {
  const client = fakeClient({
    insights: [
      {
        id: 5,
        proposed_links: [
          { kind: 'outcome', name: '  Faster Onboarding ', rationale: 'users stall at setup' },
          { kind: 'project', name: 'Still missing' },
        ],
      },
    ],
    outcomes: [{ id: 12, name: 'faster onboarding' }],
  });

  await adoptProposals(client, '7');

  const insert = client.calls.find((call) => call.sql.startsWith('INSERT INTO insight_outcomes'));
  assert.deepEqual(insert.params, ['7', 5, 12, 'users stall at setup']);
  const update = client.calls.find((call) => call.sql.startsWith('UPDATE insights'));
  assert.deepEqual(JSON.parse(update.params[0]), [{ kind: 'project', name: 'Still missing' }]);
  assert.equal(update.params[1], 5);
});

test("an adopted proposal is recorded on the insight's history", async () => {
  const proposal = { kind: 'outcome', name: 'Faster onboarding', rationale: 'users stall at setup' };
  const client = fakeClient({ insights: [{ id: 5, proposed_links: [proposal] }], outcomes: [{ id: 12, name: 'Faster onboarding' }] });

  await adoptProposals(client, '7', 3);

  const event = client.calls.find((call) => call.sql.startsWith('INSERT INTO insight_events'));
  assert.deepEqual(event.params.slice(0, 4), ['7', 5, 'proposal_adopted', 3]);
  assert.deepEqual(JSON.parse(event.params[6]), { kind: 'outcome', id: '12', proposal });
});

test('proposals with nothing to match are left alone', async () => {
  const client = fakeClient({
    insights: [{ id: 5, proposed_links: [{ kind: 'outcome', name: 'New thing' }] }],
    outcomes: [{ id: 12, name: 'Other thing' }],
    projects: [{ id: 3, name: 'New thing' }],
  });

  await adoptProposals(client, '7');

  assert.ok(!client.calls.some((call) => /^(INSERT|UPDATE)/.test(call.sql)));
});

test('only insights awaiting review are considered', async () => {
  const client = fakeClient({ insights: [] });

  await adoptProposals(client, '7');

  assert.match(client.calls[0].sql, /status = 'unvalidated'/);
  assert.equal(client.calls.length, 1);
});
