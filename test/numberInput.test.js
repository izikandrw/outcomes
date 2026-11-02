const { test, before } = require('node:test');
const assert = require('node:assert/strict');

let numberDraft;
let isNumber;
before(async () => {
  ({ numberDraft, isNumber } = await import('../web/src/lib/numberInput.js'));
});

test('anything but a number is dropped as it is typed', () => {
  assert.equal(numberDraft('abc'), '');
  assert.equal(numberDraft('12a'), '12');
  assert.equal(numberDraft('1e5'), '15');
});

test('negatives and decimals survive, including part-way through typing them', () => {
  assert.equal(numberDraft('-0.04'), '-0.04');
  assert.equal(numberDraft('-'), '-');
  assert.equal(numberDraft('1.'), '1.');
  assert.equal(numberDraft('.5'), '.5');
});

test('a minus only counts at the start, and only the first point counts', () => {
  assert.equal(numberDraft('5-'), '5');
  assert.equal(numberDraft('1.2.3'), '1.23');
});

test('a pasted dollar amount keeps its value', () => {
  assert.equal(numberDraft('$1,200.50'), '1200.50');
  assert.equal(numberDraft('-$40'), '-40');
});

test('a draft that never became a number is not one', () => {
  for (const draft of ['', '-', '.', '-.']) assert.equal(isNumber(draft), false);
  for (const draft of ['0', '-0.04', '1.', '.5']) assert.equal(isNumber(draft), true);
});
