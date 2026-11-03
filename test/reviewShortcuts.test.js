const { test, before } = require('node:test');
const assert = require('node:assert/strict');

let reviewAction, isTypingTarget, reviewLegend, worksInField;
before(async () => {
  ({ reviewAction, isTypingTarget, reviewLegend, worksInField } = await import('../web/src/lib/reviewShortcuts.js'));
});

const press = (key, modifiers = {}) => reviewAction({ key, ...modifiers });

test('J, K and the arrows move between insights', () => {
  assert.equal(press('j'), 'next');
  assert.equal(press('ArrowDown'), 'next');
  assert.equal(press('k'), 'previous');
  assert.equal(press('ArrowUp'), 'previous');
});

test('the letters name their actions, whatever Caps Lock says', () => {
  assert.equal(press('e'), 'edit');
  assert.equal(press('l'), 'link');
  assert.equal(press('o'), 'open');
  assert.equal(press('r'), 'reject');
  assert.equal(press('a'), 'approve');
  assert.equal(press('J'), 'next');
  assert.equal(press('A'), 'approve');
});

test('Shift+A approves and creates what was suggested; other shifted keys do nothing', () => {
  assert.equal(press('A', { shiftKey: true }), 'approveAll');
  assert.equal(press('R', { shiftKey: true }), null);
  assert.equal(press('ArrowDown', { shiftKey: true }), null);
});

test('Cmd or Ctrl+Enter submits', () => {
  assert.equal(press('Enter', { metaKey: true }), 'submit');
  assert.equal(press('Enter', { ctrlKey: true }), 'submit');
});

test('letters typed into a field are never actions, or an "a" would approve the insight', () => {
  const field = { classList: { contains: () => false } };
  for (const key of ['a', 'A', 'j', 'k', 'e', 'l', 'o', 'r', 'ArrowDown', 'ArrowUp']) {
    assert.equal(worksInField(press(key), field), false, key);
  }
  assert.equal(worksInField(press('A', { shiftKey: true }), field), false);
});

test('from a field, Cmd+Enter submits and Esc backs out, unless text being edited owns the Esc', () => {
  const field = { classList: { contains: () => false } };
  const text = { classList: { contains: (name) => name === 'inline-input' } };
  assert.equal(worksInField(press('Enter', { metaKey: true }), text), true);
  assert.equal(worksInField(press('Escape'), field), true);
  assert.equal(worksInField(press('Escape'), text), false);
});

test('browser shortcuts are left alone', () => {
  for (const modifier of ['metaKey', 'ctrlKey', 'altKey']) {
    assert.equal(press('a', { [modifier]: true }), null);
    assert.equal(press('r', { [modifier]: true }), null);
    assert.equal(press('l', { [modifier]: true }), null);
  }
});

test('plain Enter and other keys are not shortcuts', () => {
  assert.equal(press('Enter'), null);
  assert.equal(press(' '), null);
  assert.equal(press('x'), null);
});

test('typing in a field is not a shortcut', () => {
  assert.equal(isTypingTarget({ tagName: 'INPUT' }), true);
  assert.equal(isTypingTarget({ tagName: 'TEXTAREA' }), true);
  assert.equal(isTypingTarget({ tagName: 'SELECT' }), true);
  assert.equal(isTypingTarget({ tagName: 'DIV', isContentEditable: true }), true);
  assert.equal(isTypingTarget({ tagName: 'LI' }), false);
  assert.equal(isTypingTarget({ tagName: 'BUTTON' }), false);
});

test('the legend names the submit key for the platform', () => {
  const keys = (legend) => legend.flatMap((entry) => entry.keys);
  assert.ok(keys(reviewLegend('pending', { mac: true })).includes('⌘↵'));
  assert.ok(keys(reviewLegend('pending', { mac: false })).includes('Ctrl+↵'));
});

test('the rejected tab lists only the keys that work there', () => {
  const keys = reviewLegend('rejected').flatMap((entry) => entry.keys);
  assert.ok(keys.includes('J') && keys.includes('A'));
  for (const key of ['E', 'R', 'L', '⇧A']) assert.ok(!keys.includes(key));
});
