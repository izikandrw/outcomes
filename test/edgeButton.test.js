const { test, before } = require('node:test');
const assert = require('node:assert/strict');

let unlinkButtonPoint;
before(async () => {
  ({ unlinkButtonPoint } = await import('../web/src/lib/edgeButton.js'));
});

// A parent at x=1000 with four children hanging off one bar at y=50.
const toChild = (x) => `M1000 20 V50 H${x} V80`;

test('a lone connector gets the middle of its longest run', () => {
  assert.deepEqual(unlinkButtonPoint('M0 0 V10 H100 V20'), { x: 50, y: 10 });
});

test('a straight connector gets its middle', () => {
  assert.deepEqual(unlinkButtonPoint('M10 0 V40'), { x: 10, y: 20 });
});

test('a child in the middle of a shared bar gets the button on its own drop', () => {
  const others = [toChild(200), toChild(1400), toChild(1800)];
  assert.deepEqual(unlinkButtonPoint(toChild(600), others), { x: 600, y: 65 });
});

test('the far left child gets the stretch of bar only it runs along', () => {
  const others = [toChild(600), toChild(1400)];
  assert.deepEqual(unlinkButtonPoint(toChild(200), others), { x: 400, y: 50 });
});

test('the button is never on a stretch another connector shares', () => {
  const all = [200, 600, 1400, 1800].map(toChild);
  for (const path of all) {
    const others = all.filter((other) => other !== path);
    const { x, y } = unlinkButtonPoint(path, others);
    // Between the inner children, two or more connectors run along the bar.
    const shared = y === 50 && x > 600 && x < 1400;
    assert.equal(shared, false, `${path} put its button at ${x},${y}`);
  }
});

test('a line within hover reach counts as sharing the stretch', () => {
  // The other source's bar runs 6px below this one's whole bar.
  const point = unlinkButtonPoint('M0 0 V50 H100 V80', ['M0 10 V56 H100 V70']);
  assert.notEqual(point.y, 50);
});

test('a cross-link into the same child leaves the primary link a stretch of its own', () => {
  // Both end in the same drop at x=500.
  const primary = 'M100 20 V50 H500 V80';
  const cross = 'M900 20 V50 H500 V80';
  assert.deepEqual(unlinkButtonPoint(primary, [cross]), { x: 300, y: 50 });
});

test('a connector with nothing to itself falls back to the run into the child', () => {
  const path = 'M0 0 V50 H100 V80';
  assert.deepEqual(unlinkButtonPoint(path, [path]), { x: 100, y: 65 });
});
