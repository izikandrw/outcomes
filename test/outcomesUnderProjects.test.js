const { test, before } = require('node:test');
const assert = require('node:assert/strict');

let outcomesUnderProjects;
before(async () => {
  ({ outcomesUnderProjects } = await import('../web/src/lib/links.js'));
});

const impacts = [{ id: '1' }];
const under = (outcomes, projects) =>
  Object.fromEntries(
    [...outcomesUnderProjects(outcomes, projects, impacts).underProject].map(([id, project]) => [id, project.id])
  );

test('a parentless outcome hangs under a project an impact reaches through an outcome', () => {
  const outcomes = [{ id: '10', impact_id: '1' }, { id: '11' }, { id: '12' }];
  const projects = [{ id: '50', outcome_ids: ['10', '11', '12'] }];
  assert.deepEqual(under(outcomes, projects), { 11: '50', 12: '50' });
});

test('a project linked straight to an impact takes one too, and so does a nested one', () => {
  const outcomes = [{ id: '11' }, { id: '12' }];
  const projects = [
    { id: '50', impact_ids: ['1'], outcome_ids: ['11'] },
    { id: '51', parent_project_id: '50', outcome_ids: ['12'] },
  ];
  assert.deepEqual(under(outcomes, projects), { 11: '50', 12: '51' });
});

test('a project nothing connects to an impact stays under its outcomes', () => {
  const outcomes = [{ id: '11' }, { id: '12' }];
  const projects = [{ id: '50', outcome_ids: ['11', '12'] }];
  assert.deepEqual(under(outcomes, projects), {});
});

test('an outcome with an impact or a parent outcome stays where it is', () => {
  const outcomes = [
    { id: '10', impact_id: '1' },
    { id: '11', parent_outcome_id: '10' },
    { id: '12' },
    { id: '13', parent_outcome_id: '12' },
  ];
  const projects = [{ id: '50', outcome_ids: ['10', '11', '13'] }];
  assert.deepEqual(under(outcomes, projects), {});
});

test('a stale impact id connects nothing', () => {
  const outcomes = [{ id: '11', impact_id: '9' }];
  const projects = [{ id: '50', outcome_ids: ['11'] }];
  const { underProject, anchoredProjects } = outcomesUnderProjects(outcomes, projects, impacts);
  assert.equal(underProject.size, 0);
  assert.equal(anchoredProjects.size, 0);
});

test('parent cycles end instead of looping', () => {
  const outcomes = [
    { id: '11', parent_outcome_id: '12' },
    { id: '12', parent_outcome_id: '11' },
  ];
  const projects = [
    { id: '50', parent_project_id: '51', outcome_ids: ['11'] },
    { id: '51', parent_project_id: '50' },
  ];
  assert.deepEqual(under(outcomes, projects), {});
});
