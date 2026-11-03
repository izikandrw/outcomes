const { test, before } = require('node:test');
const assert = require('node:assert/strict');

let childCoverage, coverageWidth, coverageAmounts, coverageGap, targetActual, formatCompact;
before(async () => {
  ({ childCoverage, coverageWidth, coverageAmounts, coverageGap, targetActual, formatCompact } = await import('../web/src/lib/links.js'));
});

// Ids come back from the API as strings.
const impacts = [
  { id: '1', name: 'ARR', parent_impact_id: null },
  { id: '2', name: 'Containers', parent_impact_id: '1' },
  { id: '3', name: 'Libraries', parent_impact_id: '1' },
  { id: '4', name: 'New line', parent_impact_id: '1' },
  { id: '5', name: 'Agents', parent_impact_id: '4' },
  { id: '6', name: 'Humans', parent_impact_id: '4' },
];
const target = (id, impact_id, target_value, unit = 'ARR ($M)') => ({
  id,
  impact_id,
  outcome_id: null,
  unit,
  baseline_value: 0,
  target_value,
});
const parent = target('10', '1', 150);

test('sums the target values of children in the same unit against the parent', () => {
  const coverage = childCoverage(impacts[0], parent, impacts, [parent, target('11', '2', 100), target('12', '3', 20)]);
  assert.equal(coverage.covered, 120);
  assert.equal(coverage.share, 0.8);
  assert.equal(coverageAmounts(coverage), '120 of 150 ARR ($M)');
  assert.equal(coverageGap(coverage), '30 left to account for');
  assert.deepEqual(
    coverage.contributing.map((part) => [part.impact.name, part.value]),
    [
      ['Containers', 100],
      ['Libraries', 20],
    ],
  );
  assert.deepEqual(coverage.missing.map((child) => child.name), ['New line']);
});

test('reports 0% when children exist but none has a target', () => {
  const coverage = childCoverage(impacts[0], parent, impacts, [parent]);
  assert.equal(coverage.share, 0);
  assert.equal(coverage.missing.length, 3);
});

test('ignores targets in another unit and matches units loosely', () => {
  const coverage = childCoverage(impacts[0], parent, impacts, [
    parent,
    target('11', '2', 100, ' arr ($m) '),
    target('12', '3', 999, 'customers'),
  ]);
  assert.equal(coverage.covered, 100);
});

test('a child with no target of its own rolls up its own children', () => {
  const coverage = childCoverage(impacts[0], parent, impacts, [parent, target('11', '5', 10), target('12', '6', 5)]);
  assert.equal(coverage.covered, 15);
  assert.deepEqual(coverage.contributing.map((part) => part.impact.name), ['New line']);
});

test("a child's own target wins, so its children are not counted twice", () => {
  const coverage = childCoverage(impacts[0], parent, impacts, [parent, target('11', '4', 30), target('12', '5', 10)]);
  assert.equal(coverage.covered, 30);
});

test('counts only the first matching target on a child', () => {
  const coverage = childCoverage(impacts[0], parent, impacts, [parent, target('11', '2', 100), target('12', '2', 90)]);
  assert.equal(coverage.covered, 100);
});

test('an overshoot clamps the bar but keeps the real share', () => {
  const coverage = childCoverage(impacts[0], parent, impacts, [parent, target('11', '2', 100), target('12', '3', 80)]);
  assert.equal(coverage.share, 1.2);
  assert.equal(coverageWidth(coverage), 100);
  assert.equal(coverageGap(coverage), '30 more than the target');
});

test('an exact match leaves no gap', () => {
  const coverage = childCoverage(impacts[0], parent, impacts, [parent, target('11', '2', 150)]);
  assert.equal(coverageGap(coverage), null);
});

test('is null with no target, no children or a goal of zero', () => {
  assert.equal(childCoverage(impacts[0], undefined, impacts, []), null);
  assert.equal(childCoverage(impacts[1], target('11', '2', 100), impacts, []), null);
  assert.equal(childCoverage(impacts[0], target('10', '1', 0), impacts, []), null);
});

test('actual is the latest reading on the same zero-to-goal scale as planned', () => {
  const actual = targetActual({ ...parent, baseline_value: 75, latest_value: '100' });
  assert.equal(actual.covered, 100);
  assert.equal(coverageAmounts(actual), '100 of 150 ARR ($M)');
  assert.equal(coverageWidth(actual), (100 / 150) * 100);
});

test('actual overshoots with a clamped bar and is null with no reading or goal', () => {
  const actual = targetActual({ ...parent, latest_value: 300 });
  assert.equal(actual.share, 2);
  assert.equal(coverageWidth(actual), 100);
  assert.equal(targetActual(parent), null);
  assert.equal(targetActual(undefined), null);
  assert.equal(targetActual({ ...parent, target_value: 0, latest_value: 5 }), null);
});

test('compact amounts stay short enough for a map node', () => {
  assert.equal(formatCompact('100'), '100');
  assert.equal(formatCompact(12500), '12.5K');
  assert.equal(formatCompact(null), '—');
});
