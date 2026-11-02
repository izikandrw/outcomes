const { test, before } = require('node:test');
const assert = require('node:assert/strict');

let roadmapMonths;
let completionMonths;
before(async () => {
  ({ roadmapMonths, completionMonths } = await import('../web/src/lib/roadmapMonths.js'));
});

const NOW = new Date('2026-11-15T12:00:00Z');
const project = (id, start_at, end_at) => ({ id, start_at, end_at });
// Reads months back as { '2026-11': { inProgress: [ids], completed: [ids] } }.
const layout = (projects) =>
  Object.fromEntries(
    roadmapMonths(projects, NOW).map(({ key, inProgress, completed }) => [
      key,
      { inProgress: inProgress.map((item) => item.id), completed: completed.map((item) => item.id) },
    ]),
  );

test('a project spanning months is in progress until the month it completes', () => {
  assert.deepEqual(layout([project(1, '2026-11-10T00:00:00Z', '2027-02-20T00:00:00Z')]), {
    '2026-11': { inProgress: [1], completed: [] },
    '2026-12': { inProgress: [1], completed: [] },
    '2027-01': { inProgress: [1], completed: [] },
    '2027-02': { inProgress: [], completed: [1] },
  });
});

test('a project starting and ending in one month is listed once, as completed', () => {
  assert.deepEqual(layout([project(1, '2026-11-01T00:00:00Z', '2026-11-30T00:00:00Z')]), {
    '2026-11': { inProgress: [], completed: [1] },
  });
});

test('a project with only an end date appears only in that month', () => {
  assert.deepEqual(layout([project(1, null, '2027-01-05T00:00:00Z')]), {
    '2027-01': { inProgress: [], completed: [1] },
  });
});

test('a project with no end date stays in progress through the current month', () => {
  assert.deepEqual(layout([project(1, '2026-10-05T00:00:00Z', null)]), {
    '2026-10': { inProgress: [1], completed: [] },
    '2026-11': { inProgress: [1], completed: [] },
  });
});

test('a project with no end date stays in progress through the last month shown', () => {
  const months = layout([project(1, '2026-11-05T00:00:00Z', null), project(2, null, '2027-01-05T00:00:00Z')]);
  assert.deepEqual(months['2027-01'], { inProgress: [1], completed: [2] });
});

test('a future project with no end date appears only in the month it starts', () => {
  assert.deepEqual(layout([project(1, '2027-03-05T00:00:00Z', null)]), {
    '2027-03': { inProgress: [1], completed: [] },
  });
});

test('months run in order across years and leave out months with nothing in them', () => {
  const months = layout([project(1, null, '2027-03-05T00:00:00Z'), project(2, null, '2026-12-05T00:00:00Z')]);
  assert.deepEqual(Object.keys(months), ['2026-12', '2027-03']);
});

test('each subsection sorts by its own date, then id', () => {
  const months = layout([
    project(3, '2026-11-20T00:00:00Z', '2026-12-01T00:00:00Z'),
    project(2, '2026-11-05T00:00:00Z', '2026-12-25T00:00:00Z'),
    project(1, '2026-11-05T00:00:00Z', '2026-12-25T00:00:00Z'),
  ]);
  assert.deepEqual(months['2026-11'].inProgress, [1, 2, 3]);
  assert.deepEqual(months['2026-12'].completed, [3, 1, 2]);
});

test('projects with no dates are left out', () => {
  assert.deepEqual(layout([project(1, null, null)]), {});
});

test('the completions view lists each project once, in the month it ends', () => {
  const months = completionMonths(
    roadmapMonths(
      [
        project(1, '2026-11-10T00:00:00Z', '2027-02-20T00:00:00Z'),
        project(2, null, '2026-12-05T00:00:00Z'),
      ],
      NOW,
    ),
  );
  assert.deepEqual(
    months.map(({ key, inProgress, completed }) => [key, inProgress, completed.map((item) => item.id)]),
    [
      ['2026-12', [], [2]],
      ['2027-02', [], [1]],
    ],
  );
});

test('the completions view leaves out projects with no end date', () => {
  const months = roadmapMonths([project(1, '2026-10-05T00:00:00Z', null), project(2, null, null)], NOW);
  assert.equal(months.length, 2);
  assert.deepEqual(completionMonths(months), []);
});
