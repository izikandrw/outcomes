const { test, before } = require('node:test');
const assert = require('node:assert/strict');

let lineage, parentChoices, ancestorMoves, parentFields, modalHierarchy;
before(async () => {
  ({ lineage, parentChoices, ancestorMoves, parentFields, modalHierarchy } = await import(
    '../web/src/lib/hierarchy.js'
  ));
});

// Ids come back from the API as strings; refs may hold either.
const collections = {
  impact: [
    { id: '1', name: 'Revenue', parent_impact_id: null },
    { id: '2', name: 'ARR', parent_impact_id: '1' },
    { id: '3', name: 'Retention', parent_impact_id: null },
  ],
  outcome: [
    { id: '10', name: 'Top', parent_outcome_id: null, impact_id: '2' },
    { id: '11', name: 'Mid', parent_outcome_id: '10', impact_id: null },
    { id: '12', name: 'Leaf', parent_outcome_id: '11', impact_id: null },
    { id: '13', name: 'Other', parent_outcome_id: null, impact_id: null },
  ],
  project: [],
  team: [],
  target: [
    { id: '20', name: 'ARR goal', unit: '$M', outcome_id: null, impact_id: '2' },
    { id: '21', name: null, unit: 'users', outcome_id: '11', impact_id: null },
  ],
};
const leaf = { kind: 'outcome', id: '12' };
const names = (chain) => chain.map((crumb) => crumb.name);

test('an outcome lineage runs up through its top-level outcome into impacts, root first', () => {
  assert.deepEqual(names(lineage(leaf, collections)), ['Revenue', 'ARR', 'Top', 'Mid']);
});

test('each crumb names the child whose parent it sets', () => {
  const [revenue, , , mid] = lineage(leaf, collections);
  assert.deepEqual(revenue.child, { kind: 'impact', id: '2' });
  assert.deepEqual(mid.child, leaf);
});

test('a staged move shows in the lineage, and can cross from outcome to impact', () => {
  assert.deepEqual(names(lineage(leaf, collections, { 'outcome-11': { kind: 'impact', id: '3' } })), [
    'Retention',
    'Mid',
  ]);
  assert.deepEqual(names(lineage(leaf, collections, { 'outcome-12': null })), []);
});

test('a lineage stops at a cycle or a missing parent instead of looping', () => {
  const cyclic = {
    ...collections,
    impact: [
      { id: '1', name: 'A', parent_impact_id: '2' },
      { id: '2', name: 'B', parent_impact_id: '1' },
      { id: '3', name: 'C', parent_impact_id: '99' },
    ],
  };
  assert.deepEqual(names(lineage({ kind: 'impact', id: '1' }, cyclic)), ['B']);
  assert.deepEqual(names(lineage({ kind: 'impact', id: '3' }, cyclic)), []);
});

test('choices leave out the item and everything beneath it, staged moves included', () => {
  const outcomesFor = (id, moves) =>
    parentChoices({ kind: 'outcome', id }, collections, moves).find((group) => group.kind === 'outcome').items;
  assert.deepEqual(names(outcomesFor('10')), ['Other']);
  assert.deepEqual(names(outcomesFor('13')), ['Top', 'Mid', 'Leaf']);
  assert.deepEqual(names(outcomesFor('13', { 'outcome-10': { kind: 'outcome', id: '13' } })), []);
});

test('an outcome can choose impacts too; an impact only impacts', () => {
  assert.deepEqual(
    parentChoices(leaf, collections).map((group) => group.kind),
    ['impact', 'outcome'],
  );
  assert.deepEqual(
    parentChoices({ kind: 'impact', id: '1' }, collections).map((group) => group.kind),
    ['impact'],
  );
});

test('a new item has nothing beneath it, so every item is a choice', () => {
  const [group] = parentChoices({ kind: 'impact', id: 'new' }, collections);
  assert.equal(group.items.length, 3);
});

test('ancestor moves only list changes still on the chain', () => {
  const swapMid = { 'outcome-11': { kind: 'outcome', id: '13' } };
  assert.deepEqual(ancestorMoves(leaf, collections, swapMid), [
    { child: { kind: 'outcome', id: '11' }, parent: { kind: 'outcome', id: '13' } },
  ]);
  // The edited item's own move isn't an ancestor's.
  assert.deepEqual(ancestorMoves(leaf, collections, { 'outcome-12': { kind: 'outcome', id: '10' } }), []);
  // Swapped back to where it started.
  assert.deepEqual(ancestorMoves(leaf, collections, { 'outcome-11': { kind: 'outcome', id: 10 } }), []);
  // Mid left the chain when the item moved away from it.
  assert.deepEqual(
    ancestorMoves(leaf, collections, { ...swapMid, 'outcome-12': { kind: 'outcome', id: '13' } }),
    [],
  );
  // Cleared to the top level.
  assert.deepEqual(ancestorMoves(leaf, collections, { 'outcome-10': null }), [
    { child: { kind: 'outcome', id: '10' }, parent: null },
  ]);
});

test('an outcome keeps one parent column set: outcome or impact, never both', () => {
  assert.deepEqual(parentFields('outcome', { kind: 'impact', id: '1' }), { parent_outcome_id: null, impact_id: '1' });
  assert.deepEqual(parentFields('outcome', { kind: 'outcome', id: '10' }), { parent_outcome_id: '10', impact_id: null });
  assert.deepEqual(parentFields('outcome', null), { parent_outcome_id: null, impact_id: null });
  assert.deepEqual(parentFields('project', { kind: 'project', id: '5' }), { parent_project_id: '5' });
  assert.deepEqual(parentFields('team', null), { parent_team_id: null });
});

test('a modal starts from the stored parent, or the one a new item was added under', () => {
  const fields = (modal) => modalHierarchy(modal).fields;
  assert.deepEqual(fields({ kind: 'outcome', outcome: collections.outcome[0] }), {
    parent_outcome_id: null,
    impact_id: '2',
  });
  assert.deepEqual(fields({ kind: 'outcome', outcome: null, parentId: '10' }), {
    parent_outcome_id: '10',
    impact_id: null,
  });
  assert.deepEqual(fields({ kind: 'outcome', outcome: null, parentId: null, impactId: '3' }), {
    parent_outcome_id: null,
    impact_id: '3',
  });
  assert.deepEqual(fields({ kind: 'impact', impact: null, parent: { id: '1' } }), { parent_impact_id: '1' });
  assert.deepEqual(fields({ kind: 'project', project: null, parent: null, parentProject: { id: '7' } }), {
    parent_project_id: '7',
  });
  // A new project added from an outcome links to it instead of nesting.
  assert.deepEqual(fields({ kind: 'project', project: null, parent: { id: '10' } }), { parent_project_id: null });
  assert.deepEqual(fields({ kind: 'team', team: null, parent: { id: '4' } }), { parent_team_id: '4' });
});

test('a staged move on the open item wins, and other kinds of modal have no hierarchy', () => {
  const opened = modalHierarchy({ kind: 'impact', impact: collections.impact[1], moves: { 'impact-2': null } });
  assert.deepEqual(opened.fields, { parent_impact_id: null });
  assert.equal(modalHierarchy({ kind: 'account' }), null);
  assert.equal(modalHierarchy(null), null);
});

const chainOf = (modal) => {
  const { start, moves } = modalHierarchy(modal);
  return names(lineage(start, collections, moves));
};

test('a target sits under what it quantifies, named by its unit when it has no name', () => {
  const [impactTarget, outcomeTarget] = collections.target;
  assert.deepEqual(chainOf({ kind: 'target-measurements', target: impactTarget }), ['Revenue', 'ARR']);
  assert.deepEqual(chainOf({ kind: 'target', target: outcomeTarget }), ['Revenue', 'ARR', 'Top', 'Mid']);
  assert.deepEqual(chainOf({ kind: 'target', target: null, parent: { id: '3' }, parentKind: 'impact' }), ['Retention']);
  assert.deepEqual(chainOf({ kind: 'measurement', target: outcomeTarget, parent: { id: '11' } }), [
    'Revenue',
    'ARR',
    'Top',
    'Mid',
    'users',
  ]);
  assert.deepEqual(chainOf({ kind: 'measurement', parent: { id: '10' } }), ['Revenue', 'ARR', 'Top']);
});

test('a view of an item shows the item as its last crumb', () => {
  assert.deepEqual(chainOf({ kind: 'entity-insights', entity: { id: '10' }, entityKind: 'outcome' }), [
    'Revenue',
    'ARR',
    'Top',
  ]);
  assert.deepEqual(chainOf({ kind: 'issue', rule: { appliesTo: 'impact' }, entity: { id: '2' } }), ['Revenue', 'ARR']);
  assert.deepEqual(chainOf({ kind: 'entity-insights', entity: { id: '10', suggested: true }, entityKind: 'outcome' }), []);
});

test('only forms that save their parents can swap them', () => {
  assert.equal(modalHierarchy({ kind: 'outcome', outcome: collections.outcome[0] }).editable, true);
  assert.equal(modalHierarchy({ kind: 'target-measurements', target: collections.target[0] }).editable, undefined);
  assert.equal(modalHierarchy({ kind: 'target', target: collections.target[0] }).editable, undefined);
});
