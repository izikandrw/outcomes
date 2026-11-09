const { test, before } = require('node:test');
const assert = require('node:assert/strict');

let targetSummary, targetBody, formatQuantity;
before(async () => {
  ({ targetSummary, targetBody, formatQuantity } = await import('../web/src/lib/links.js'));
});

const target = (name, unit, baseline_value = 0, target_value = 1) => ({ name, unit, baseline_value, target_value });

test('puts the name in front of the numbers', () => {
  assert.equal(targetSummary(target('ARR', '$'), 21), 'ARR: $0 → $1');
});

test('a target with no name is just its numbers', () => {
  assert.equal(targetSummary(target(null, '$'), 21), '$0 → $1');
});

test('drops a name that would not fit rather than clipping the numbers', () => {
  assert.equal(targetSummary(target('Estimated ARR contribution', 'ARR ($M)', 75, 143), 21), '75 → 143 ARR ($M)');
});

test('fits right up to the limit', () => {
  const summary = 'ARR: $0 → $1';
  assert.equal(targetSummary(target('ARR', '$'), summary.length), summary);
  assert.equal(targetSummary(target('ARR', '$'), summary.length - 1), '$0 → $1');
});

test('skips a name the unit already says', () => {
  assert.equal(targetSummary(target('ARR', 'ARR ($M)'), 21), '0 → 1 ARR ($M)');
  assert.equal(targetSummary(target('arr', 'ARR'), 21), '0 → 1 ARR');
});

test('has no limit unless given one', () => {
  assert.equal(targetSummary(target('Estimated contribution', '$')), 'Estimated contribution: $0 → $1');
});

const saved = {
  id: '7',
  account_id: '1',
  outcome_id: null,
  impact_id: null,
  project_id: '3',
  name: 'ARR',
  description: 'From the finance sheet',
  unit: '$',
  baseline_value: '70',
  target_value: '138',
  baseline_at: '2026-01-01T00:00:00.000Z',
  due_at: null,
  latest_value: '90',
  measurement_count: 2,
};

test('saving a description sends the rest of the target back unchanged', () => {
  assert.deepEqual(targetBody(saved, { description: 'Booked ARR only' }), {
    outcome_id: null,
    impact_id: null,
    project_id: '3',
    name: 'ARR',
    description: 'Booked ARR only',
    unit: '$',
    baseline_value: 70,
    target_value: 138,
    baseline_at: '2026-01-01T00:00:00.000Z',
    due_at: null,
  });
});

test('a description can be cleared', () => {
  assert.equal(targetBody(saved, { description: null }).description, null);
});

test('editing the range keeps the description', () => {
  const body = targetBody(saved, { target_value: 200 });
  assert.equal(body.description, 'From the finance sheet');
  assert.equal(body.target_value, 200);
});

test('writes currency before the number, percent flush after, other units after a space', () => {
  assert.equal(formatQuantity(1200, '$'), '$1200');
  assert.equal(formatQuantity(4.5, ' € '), '€4.5');
  assert.equal(formatQuantity(40, '%'), '40%');
  assert.equal(formatQuantity(1200, 'users'), '1200 users');
  assert.equal(formatQuantity(75, 'ARR ($M)'), '75 ARR ($M)');
  assert.equal(formatQuantity(3, ''), '3');
});

test('a symbol unit is written on both ends of a range, a word unit once', () => {
  assert.equal(targetSummary(target('ARR', '$', 1000, 1200)), 'ARR: $1000 → $1200');
  assert.equal(targetSummary(target(null, '%', 40, 60)), '40% → 60%');
  assert.equal(targetSummary(target(null, 'users', 10, 20)), '10 → 20 users');
});
