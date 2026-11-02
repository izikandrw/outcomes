const { test, before } = require('node:test');
const assert = require('node:assert/strict');

let selectedFirst;
before(async () => {
  ({ selectedFirst } = await import('../web/src/lib/selectedFirst.js'));
});

const names = (items) => items.map((item) => item.name);
const items = ['a', 'b', 'c', 'd'].map((name) => ({ name }));

test('selected items come first, and each part keeps its order', () => {
  const picked = new Set(['d', 'b']);
  assert.deepEqual(names(selectedFirst(items, (item) => picked.has(item.name))), ['b', 'd', 'a', 'c']);
});

test('the list is unchanged when nothing is selected', () => {
  assert.deepEqual(names(selectedFirst(items, () => false)), ['a', 'b', 'c', 'd']);
});
