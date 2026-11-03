const { test, before } = require('node:test');
const assert = require('node:assert/strict');

let rollup, coverageWidth, coverageAmounts, coverageGap, targetActual, formatCompact;
before(async () => {
  let childCoverage;
  ({ childCoverage, coverageWidth, coverageAmounts, coverageGap, targetActual, formatCompact } = await import('../web/src/lib/links.js'));
  rollup = childCoverage;
});
// The impact-only cases below.
const coverageOf = (impact, target, allImpacts, targets) => rollup('impact', impact, target, { impacts: allImpacts, targets });

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
  const coverage = coverageOf(impacts[0], parent, impacts, [parent, target('11', '2', 100), target('12', '3', 20)]);
  assert.equal(coverage.covered, 120);
  assert.equal(coverage.share, 0.8);
  assert.equal(coverageAmounts(coverage), '120 of 150 ARR ($M)');
  assert.equal(coverageGap(coverage), '30 left to account for');
  assert.deepEqual(
    coverage.contributing.map((part) => [part.item.name, part.value]),
    [
      ['Containers', 100],
      ['Libraries', 20],
    ],
  );
  assert.deepEqual(coverage.missing.map((child) => child.name), ['New line']);
});

test('reports 0% when children exist but none has a target', () => {
  const coverage = coverageOf(impacts[0], parent, impacts, [parent]);
  assert.equal(coverage.share, 0);
  assert.equal(coverage.missing.length, 3);
});

test('ignores targets in another unit and matches units loosely', () => {
  const coverage = coverageOf(impacts[0], parent, impacts, [
    parent,
    target('11', '2', 100, ' arr ($m) '),
    target('12', '3', 999, 'customers'),
  ]);
  assert.equal(coverage.covered, 100);
});

test('a child with no target of its own rolls up its own children', () => {
  const coverage = coverageOf(impacts[0], parent, impacts, [parent, target('11', '5', 10), target('12', '6', 5)]);
  assert.equal(coverage.covered, 15);
  assert.deepEqual(coverage.contributing.map((part) => part.item.name), ['New line']);
});

test("a child's own target wins, so its children are not counted twice", () => {
  const coverage = coverageOf(impacts[0], parent, impacts, [parent, target('11', '4', 30), target('12', '5', 10)]);
  assert.equal(coverage.covered, 30);
});

test('counts only the first matching target on a child', () => {
  const coverage = coverageOf(impacts[0], parent, impacts, [parent, target('11', '2', 100), target('12', '2', 90)]);
  assert.equal(coverage.covered, 100);
});

test('an overshoot clamps the bar but keeps the real share', () => {
  const coverage = coverageOf(impacts[0], parent, impacts, [parent, target('11', '2', 100), target('12', '3', 80)]);
  assert.equal(coverage.share, 1.2);
  assert.equal(coverageWidth(coverage), 100);
  assert.equal(coverageGap(coverage), '30 more than the target');
});

test('an exact match leaves no gap', () => {
  const coverage = coverageOf(impacts[0], parent, impacts, [parent, target('11', '2', 150)]);
  assert.equal(coverageGap(coverage), null);
});

test('is null with no target, no children or a goal of zero', () => {
  assert.equal(coverageOf(impacts[0], undefined, impacts, []), null);
  assert.equal(coverageOf(impacts[1], target('11', '2', 100), impacts, []), null);
  assert.equal(coverageOf(impacts[0], target('10', '1', 0), impacts, []), null);
});

// A project's target rolling up. A target's parent is one of three columns.
const owned = (id, column, parentId, target_value, unit = 'ARR ($M)') => ({
  id,
  outcome_id: null,
  impact_id: null,
  project_id: null,
  [column]: parentId,
  unit,
  baseline_value: 0,
  target_value,
});
const project = (id, name, links = {}) => ({ id, name, parent_project_id: null, outcome_ids: [], impact_ids: [], ...links });
const arr = { id: '1', name: 'ARR', parent_impact_id: null };
const arrGoal = owned('10', 'impact_id', '1', 150);

test("a project's target rolls up to an impact it drives directly", () => {
  const checkout = project('20', 'Checkout', { impact_ids: ['1'] });
  const coverage = rollup('impact', arr, arrGoal, {
    impacts: [arr],
    projects: [checkout],
    targets: [arrGoal, owned('11', 'project_id', '20', 60)],
  });
  assert.equal(coverage.covered, 60);
  assert.equal(coverage.source, 'projects');
  assert.deepEqual(coverage.contributing.map((part) => [part.kind, part.item.name]), [['project', 'Checkout']]);
});

test("a project's target rolls up to an outcome it drives", () => {
  const outcome = { id: '5', name: 'Self serve', parent_outcome_id: null, impact_id: null };
  const goal = owned('12', 'outcome_id', '5', 100, 'signups');
  const coverage = rollup('outcome', outcome, goal, {
    outcomes: [outcome],
    projects: [project('20', 'Checkout', { outcome_ids: ['5'] }), project('21', 'Docs', { outcome_ids: ['5'] })],
    targets: [goal, owned('11', 'project_id', '20', 40, 'signups')],
  });
  assert.equal(coverage.share, 0.4);
  assert.deepEqual(coverage.missing.map((item) => item.name), ['Docs']);
});

test('a project reaches an impact through the outcome it drives', () => {
  const outcome = { id: '5', name: 'Self serve', parent_outcome_id: null, impact_id: '1' };
  const coverage = rollup('impact', arr, arrGoal, {
    impacts: [arr],
    outcomes: [outcome],
    projects: [project('20', 'Checkout', { outcome_ids: ['5'] })],
    targets: [arrGoal, owned('11', 'project_id', '20', 70)],
  });
  assert.equal(coverage.covered, 70);
  assert.equal(coverage.contributing[0].item.name, 'Self serve');
});

test('an outcome with its own target in the unit stands in for its projects', () => {
  const outcome = { id: '5', name: 'Self serve', parent_outcome_id: null, impact_id: '1' };
  const coverage = rollup('impact', arr, arrGoal, {
    impacts: [arr],
    outcomes: [outcome],
    projects: [project('20', 'Checkout', { outcome_ids: ['5'] })],
    targets: [arrGoal, owned('13', 'outcome_id', '5', 90), owned('11', 'project_id', '20', 70)],
  });
  assert.equal(coverage.covered, 90);
});

test('a project reached by two routes counts once', () => {
  const both = project('20', 'Checkout', { outcome_ids: ['5', '6'] });
  const coverage = rollup('impact', arr, arrGoal, {
    impacts: [arr],
    outcomes: [
      { id: '5', name: 'A', parent_outcome_id: null, impact_id: '1' },
      { id: '6', name: 'B', parent_outcome_id: null, impact_id: '1' },
    ],
    projects: [both],
    targets: [arrGoal, owned('11', 'project_id', '20', 70)],
  });
  assert.equal(coverage.covered, 70);
});

test('a child project with no target rolls up its own children', () => {
  const parentProject = project('20', 'Platform', { impact_ids: ['1'] });
  const child = project('21', 'Billing', { parent_project_id: '20' });
  const coverage = rollup('impact', arr, arrGoal, {
    impacts: [arr],
    projects: [parentProject, child],
    targets: [arrGoal, owned('11', 'project_id', '21', 30)],
  });
  assert.equal(coverage.covered, 30);
});

test('a project shows what its child projects account for', () => {
  const parentProject = project('20', 'Platform');
  const goal = owned('11', 'project_id', '20', 50);
  const coverage = rollup('project', parentProject, goal, {
    projects: [parentProject, project('21', 'Billing', { parent_project_id: '20' })],
    targets: [goal, owned('12', 'project_id', '21', 20)],
  });
  assert.equal(coverage.covered, 20);
  assert.equal(coverage.source, 'child projects');
});

test('nothing in the unit from outcomes or projects shows no bar, unlike child impacts', () => {
  const outcome = { id: '5', name: 'Self serve', parent_outcome_id: null, impact_id: '1' };
  const collections = {
    impacts: [arr],
    outcomes: [outcome],
    projects: [project('20', 'Checkout', { impact_ids: ['1'] })],
    targets: [arrGoal, owned('11', 'project_id', '20', 70, 'signups'), owned('12', 'outcome_id', '5', 9, 'signups')],
  };
  assert.equal(rollup('impact', arr, arrGoal, collections), null);
});

test('an outcome under an impact is not listed as missing a number', () => {
  const coverage = rollup('impact', arr, arrGoal, {
    impacts: [arr],
    outcomes: [{ id: '5', name: 'Self serve', parent_outcome_id: null, impact_id: '1' }],
    projects: [project('20', 'Checkout', { impact_ids: ['1'] }), project('21', 'Docs', { impact_ids: ['1'] })],
    targets: [arrGoal, owned('11', 'project_id', '20', 70)],
  });
  assert.deepEqual(coverage.missing.map((item) => item.name), ['Docs']);
  assert.equal(coverage.missingLabel, 'projects');
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
