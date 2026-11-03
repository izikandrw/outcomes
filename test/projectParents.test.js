const { test, before } = require('node:test');
const assert = require('node:assert/strict');

let linkBetween, impactsReachedThroughOutcomes, rollupForProjects, targetsFor;
let lineage, otherLinkedParents, storedParent, modalHierarchy, validateTree, paletteEntries;
before(async () => {
  ({ linkBetween, impactsReachedThroughOutcomes, rollupForProjects, targetsFor } = await import('../web/src/lib/links.js'));
  ({ lineage, otherLinkedParents, storedParent, modalHierarchy } = await import('../web/src/lib/hierarchy.js'));
  ({ validateTree } = await import('../web/src/lib/validation.js'));
  ({ paletteEntries } = await import('../web/src/lib/commandPalette.js'));
});

// Ids come back from the API as strings.
const impacts = [
  { id: '1', name: 'Revenue', parent_impact_id: null },
  { id: '2', name: 'SMB revenue', parent_impact_id: '1' },
  { id: '3', name: 'Costs', parent_impact_id: null },
];
const outcomes = [
  { id: '10', name: 'Top', parent_outcome_id: null, impact_id: '2' },
  { id: '11', name: 'Leaf', parent_outcome_id: '10', impact_id: null },
];
const projects = [
  { id: '20', name: 'Driver', parent_project_id: null, outcome_ids: ['11'], impact_ids: [] },
  { id: '21', name: 'Direct', parent_project_id: null, outcome_ids: [], impact_ids: ['3', '1'] },
  { id: '22', name: 'Loose', parent_project_id: null, outcome_ids: [], impact_ids: [] },
];
const node = (type, data) => ({ type, data });
const all = { impacts, outcomes, projects };
const collections = { impact: impacts, outcome: outcomes, project: projects, target: [] };

test('a project can be dropped on an impact, whichever end the drag starts from', () => {
  for (const [from, to] of [
    [node('impact', impacts[2]), node('project', projects[2])],
    [node('project', projects[2]), node('impact', impacts[2])],
  ]) {
    const link = linkBetween(from, to, all);
    assert.equal(link.parent.data.name, 'Costs');
    assert.equal(link.child.data.name, 'Loose');
  }
});

test('dropping a project on an impact it already drives does nothing', () => {
  const link = linkBetween(node('impact', impacts[2]), node('project', projects[1]), all);
  assert.match(link.reason, /already drives/);
});

test('dropping a project on an impact its outcome reaches does nothing, up to the parent impact', () => {
  assert.match(linkBetween(node('impact', impacts[1]), node('project', projects[0]), all).reason, /through an outcome/);
  assert.match(linkBetween(node('impact', impacts[0]), node('project', projects[0]), all).reason, /through an outcome/);
  assert.equal(linkBetween(node('impact', impacts[2]), node('project', projects[0]), all).child.data.name, 'Driver');
});

test('an outcome reaches its impact through its top-level ancestor', () => {
  assert.deepEqual([...impactsReachedThroughOutcomes(projects[0], outcomes, impacts)].sort(), ['1', '2']);
  assert.equal(impactsReachedThroughOutcomes(projects[1], outcomes, impacts).size, 0);
});

test('targetsFor reads the parent column of any kind', () => {
  const targets = [
    { id: '1', outcome_id: '20', impact_id: null, project_id: null },
    { id: '2', outcome_id: null, impact_id: null, project_id: '20' },
  ];
  assert.deepEqual(targetsFor(targets, { id: '20' }, 'project').map((target) => target.id), ['2']);
  assert.deepEqual(targetsFor(targets, { id: '20' }, 'outcome').map((target) => target.id), ['1']);
});

test("a project's target sits under the project, and on up through what it drives", () => {
  const target = { id: '30', unit: 'ARR', outcome_id: null, impact_id: null, project_id: '21' };
  assert.deepEqual(storedParent('target', target), { kind: 'project', id: '21' });
  const chain = lineage({ kind: 'target', id: '30' }, { ...collections, target: [target] });
  assert.deepEqual(chain.map((crumb) => crumb.name), ['Revenue', 'Direct']);
});

test('a project with no outcome sits under an impact it drives, and names the others', () => {
  const start = { kind: 'project', id: '21' };
  const [crumb] = lineage(start, collections);
  assert.equal(crumb.name, 'Revenue');
  assert.equal(crumb.linked, true);
  assert.deepEqual(otherLinkedParents(start, collections), [{ kind: 'impact', id: '3', name: 'Costs' }]);
});

test('a project added from an impact starts under it', () => {
  const opened = modalHierarchy({ kind: 'project', project: null, parent: { id: '3' }, parentKind: 'impact' });
  assert.equal(opened.start.linkedImpactId, '3');
  assert.deepEqual(lineage(opened.start, collections, opened.moves).map((crumb) => crumb.name), ['Costs']);
});

test('a direct link answers both "what is the point" and "how does this impact happen"', () => {
  const rules = (kind, entity, validation) => (validation[kind].get(entity.id) ?? []).map((rule) => rule.id);
  const costs = { id: '4', name: 'Lonely', parent_impact_id: null };
  const validation = validateTree({ outcomes, projects, insights: [], impacts: [...impacts, costs] });
  assert.ok(rules('project', projects[2], validation).includes('whats-the-point'));
  assert.ok(!rules('project', projects[1], validation).includes('whats-the-point'));
  assert.ok(rules('impact', costs, validation).includes('chimerical-impact'));
  assert.ok(!rules('impact', impacts[2], validation).includes('chimerical-impact'));
});

test('a team rolls up through a project it runs straight to an impact', () => {
  const rollup = rollupForProjects([projects[1], projects[2]], outcomes, impacts);
  assert.deepEqual(rollup.roots.map((root) => root.data.name), ['Revenue', 'Costs']);
  assert.deepEqual(rollup.roots[1].children.map((child) => [child.kind, child.data.name]), [['project', 'Direct']]);
  assert.deepEqual(rollup.unlinkedProjects.map((project) => project.name), ['Loose']);
});

test("the palette names a project target's project", () => {
  const entries = paletteEntries({
    projects,
    targets: [{ id: '30', unit: 'ARR', name: null, outcome_id: null, impact_id: null, project_id: '21' }],
  });
  const entry = entries.find((item) => item.kind === 'target');
  assert.ok(JSON.stringify(entry).includes('Direct'));
});
