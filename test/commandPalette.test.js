const { test, before } = require('node:test');
const assert = require('node:assert/strict');

let paletteEntries, searchEntries, isPaletteShortcut;
before(async () => {
  ({ paletteEntries, searchEntries, isPaletteShortcut } = await import('../web/src/lib/commandPalette.js'));
});

const data = () => ({
  teams: [{ id: '1', name: 'Platform' }],
  impacts: [{ id: '2', name: 'Grow revenue', description: 'More ARR from existing customers' }],
  outcomes: [
    { id: '3', name: 'Customers map their images', description: null },
    { id: '42', name: 'Faster onboarding', description: 'Fewer  days\nto first pull' },
  ],
  projects: [{ id: '4', name: 'Café rewrite', description: 'Onboarding wizard' }],
  targets: [{ id: '5', name: null, unit: 'ARR', outcome_id: null, impact_id: '2' }],
  insights: [
    { id: '6', name: 'Trial users churn', status: 'validated', source: 'Zendesk' },
    { id: '7', name: 'Docs are confusing', status: 'unvalidated' },
    { id: '8', name: 'Rejected churn idea', status: 'rejected' },
  ],
});

const names = (query) => searchEntries(paletteEntries(data()), query).map((entry) => entry.name);

test('with nothing typed it lists only the places to go', () => {
  const found = searchEntries(paletteEntries(data()), '   ');
  assert.ok(found.length > 0);
  assert.ok(found.every((entry) => entry.kind === 'page'));
  assert.equal(found[0].name, 'Map');
  assert.ok(found.some((entry) => entry.name === 'Teams'));
});

test('"The map" and "Impacts" find their pages first', () => {
  assert.equal(names('The map')[0], 'Map');
  assert.equal(names('impacts')[0], 'Impacts');
  assert.equal(names('imp')[0], 'Impacts');
});

test('a page beats an item that matches just as well', () => {
  const entries = paletteEntries({ ...data(), outcomes: [{ id: '9', name: 'Map' }] });
  const found = searchEntries(entries, 'map');
  assert.deepEqual(found.slice(0, 2).map((entry) => entry.kind), ['page', 'outcome']);
});

test('finds items of every kind and carries where they go', () => {
  const find = (query) => searchEntries(paletteEntries(data()), query)[0];
  assert.deepEqual([find('grow').kind, find('grow').id], ['impact', '2']);
  assert.deepEqual([find('faster').kind, find('faster').id], ['outcome', '42']);
  assert.deepEqual([find('rewrite').kind, find('rewrite').id], ['project', '4']);
  assert.deepEqual([find('arr').kind, find('arr').id], ['target', '5']);
  assert.deepEqual([find('platform').kind, find('platform').id], ['team', '1']);
  assert.deepEqual([find('trial').kind, find('trial').id], ['insight', '6']);
});

test('a place goes to its page, tab or modal', () => {
  const find = (query) => searchEntries(paletteEntries(data()), query)[0];
  assert.equal(find('roadmap').page, 'roadmap');
  assert.deepEqual([find('collector runs').page, find('collector runs').tab], ['review', 'runs']);
  assert.equal(find('members').modal, 'members');
});

test('a name match ranks above a match only in the description', () => {
  assert.deepEqual(names('onboarding'), ['Faster onboarding', 'Café rewrite']);
});

test('ranks a name by how early the match is', () => {
  const entries = paletteEntries({
    outcomes: [
      { id: '1', name: 'Reduce unchurnable users' },
      { id: '2', name: 'Reduce churn' },
      { id: '3', name: 'Churn' },
      { id: '4', name: 'Churn down' },
    ],
  });
  assert.deepEqual(searchEntries(entries, 'churn').map((entry) => entry.id), ['3', '4', '2', '1']);
});

test('every word typed has to appear, in any order and across fields', () => {
  assert.deepEqual(names('onboarding faster'), ['Faster onboarding']);
  assert.deepEqual(names('faster pull'), ['Faster onboarding']);
  assert.deepEqual(names('faster nonsense'), []);
});

test('ignores case, accents and punctuation', () => {
  assert.equal(names('CAFE')[0], 'Café rewrite');
  assert.equal(names('cafe-rewrite')[0], 'Café rewrite');
});

test('finds an item by its id, with or without the #', () => {
  assert.equal(names('#42')[0], 'Faster onboarding');
  assert.equal(names('42')[0], 'Faster onboarding');
  assert.deepEqual(names('#999'), []);
});

test('rejected insights stay out; suggested ones are marked', () => {
  assert.deepEqual(names('churn'), ['Trial users churn']);
  assert.equal(searchEntries(paletteEntries(data()), 'docs')[0].suggested, true);
  assert.notEqual(searchEntries(paletteEntries(data()), 'trial')[0].suggested, true);
});

test('a target with no name reads as its unit, under what it measures', () => {
  const target = searchEntries(paletteEntries(data()), 'arr').find((entry) => entry.kind === 'target');
  assert.deepEqual([target.name, target.detail], ['ARR', 'Grow revenue']);
});

test('a description shows on one line', () => {
  const outcome = searchEntries(paletteEntries(data()), 'faster')[0];
  assert.equal(outcome.detail, 'Fewer days to first pull');
});

test('copes with an empty account', () => {
  assert.deepEqual(searchEntries(paletteEntries({}), 'anything'), []);
});

test('Cmd+K on a Mac, Ctrl+K elsewhere', () => {
  const press = (overrides) => ({ key: 'k', metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...overrides });
  assert.equal(isPaletteShortcut(press({ metaKey: true }), { mac: true }), true);
  assert.equal(isPaletteShortcut(press({ key: 'K', metaKey: true }), { mac: true }), true);
  assert.equal(isPaletteShortcut(press({ ctrlKey: true }), { mac: true }), false);
  assert.equal(isPaletteShortcut(press({ ctrlKey: true }), { mac: false }), true);
  assert.equal(isPaletteShortcut(press({ metaKey: true }), { mac: false }), false);
  assert.equal(isPaletteShortcut(press({}), { mac: true }), false);
  assert.equal(isPaletteShortcut(press({ metaKey: true, shiftKey: true }), { mac: true }), false);
  assert.equal(isPaletteShortcut(press({ key: 'j', metaKey: true }), { mac: true }), false);
});
