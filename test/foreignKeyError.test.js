const { test } = require('node:test');
const assert = require('node:assert/strict');
const { foreignKeyMessage } = require('../src/lib/foreignKeyError');

const referencedFrom = (table) => ({ detail: `Key (id)=(29) is still referenced from table "${table}".` });

test('a refused delete names what is still attached', () => {
  assert.equal(foreignKeyMessage(referencedFrom('measurements')), 'still has readings; remove those first');
  assert.equal(foreignKeyMessage(referencedFrom('impacts')), 'still has child impacts; remove those first');
});

test('a table with no plain name keeps the generic message', () => {
  assert.equal(foreignKeyMessage(referencedFrom('invites')), 'referenced by or references a missing row');
});

test('a write pointing at a missing row keeps the generic message', () => {
  const err = { detail: 'Key (impact_id)=(999) is not present in table "impacts".' };
  assert.equal(foreignKeyMessage(err), 'referenced by or references a missing row');
  assert.equal(foreignKeyMessage({}), 'referenced by or references a missing row');
});
