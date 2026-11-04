const { test, before } = require('node:test');
const assert = require('node:assert/strict');

let targetSummary;
before(async () => {
  ({ targetSummary } = await import('../web/src/lib/links.js'));
});

const target = (name, unit, baseline_value = 0, target_value = 1) => ({ name, unit, baseline_value, target_value });

test('puts the name in front of the numbers', () => {
  assert.equal(targetSummary(target('ARR', '$'), 21), 'ARR: 0 → 1 $');
});

test('a target with no name is just its numbers', () => {
  assert.equal(targetSummary(target(null, '$'), 21), '0 → 1 $');
});

test('drops a name that would not fit rather than clipping the numbers', () => {
  assert.equal(targetSummary(target('Estimated ARR contribution', 'ARR ($M)', 75, 143), 21), '75 → 143 ARR ($M)');
});

test('fits right up to the limit', () => {
  const summary = 'ARR: 0 → 1 $';
  assert.equal(targetSummary(target('ARR', '$'), summary.length), summary);
  assert.equal(targetSummary(target('ARR', '$'), summary.length - 1), '0 → 1 $');
});

test('skips a name the unit already says', () => {
  assert.equal(targetSummary(target('ARR', 'ARR ($M)'), 21), '0 → 1 ARR ($M)');
  assert.equal(targetSummary(target('arr', 'ARR'), 21), '0 → 1 ARR');
});

test('has no limit unless given one', () => {
  assert.equal(targetSummary(target('Estimated contribution', '$')), 'Estimated contribution: 0 → 1 $');
});
