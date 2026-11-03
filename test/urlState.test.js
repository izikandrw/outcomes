const { test, before } = require('node:test');
const assert = require('node:assert/strict');

let shareSearchOfModal;
let readUrl;
before(async () => {
  ({ shareSearchOfModal, readUrl } = await import('../web/src/lib/urlState.js'));
});

const view = { page: 'map', teamId: null };

test('an open item shares a link that reopens it on the same page', () => {
  const search = shareSearchOfModal({ kind: 'outcome', outcome: { id: 39 } }, view);
  assert.equal(search, '?page=map&outcome=39');
  assert.deepEqual(readUrl(search).item, { kind: 'outcome', id: '39' });
});

test('a link from a team home keeps the team', () => {
  const search = shareSearchOfModal({ kind: 'project', project: { id: 7 } }, { page: 'team', teamId: '3' });
  assert.equal(search, '?page=team&team=3&project=7');
});

test('both views of a target share the link that opens it', () => {
  const target = { id: 12 };
  assert.equal(shareSearchOfModal({ kind: 'target', target }, view), '?page=map&target=12');
  assert.equal(shareSearchOfModal({ kind: 'target-measurements', target }, view), '?page=map&target=12');
});

test('a team shares its home, whatever page it was opened on', () => {
  assert.equal(shareSearchOfModal({ kind: 'team', team: { id: 3 } }, { page: 'teams', teamId: null }), '?page=team&team=3');
});

test('an insight always shares a link to the insights page', () => {
  assert.equal(shareSearchOfModal({ kind: 'insight', insight: { id: 5 } }, view), '?page=insights&insight=5');
});

test('anything that is not one existing item has no link', () => {
  assert.equal(shareSearchOfModal({ kind: 'outcome', outcome: null }, view), null);
  assert.equal(shareSearchOfModal({ kind: 'project', project: null }, view), null);
  assert.equal(shareSearchOfModal({ kind: 'target', target: null }, view), null);
  assert.equal(shareSearchOfModal({ kind: 'team', team: null }, view), null);
  assert.equal(shareSearchOfModal({ kind: 'measurement', target: { id: 1 } }, view), null);
  assert.equal(shareSearchOfModal({ kind: 'account' }, view), null);
});
