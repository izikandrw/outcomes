// The review queue's keys, following the conventions people already know: J/K to
// move as in Gmail and GitHub, E to edit, Tab between fields, Enter to save, Esc
// to back out, and Cmd/Ctrl+Enter to submit from anywhere, as when sending a
// message in Slack or Gmail.

// The action a key press asks for, or null. Letters ignore Caps Lock.
export function reviewAction({ key, metaKey, ctrlKey, altKey, shiftKey }) {
  if (altKey) return null;
  if (metaKey || ctrlKey) return key === 'Enter' && !shiftKey ? 'submit' : null;
  if (key === 'ArrowDown') return shiftKey ? null : 'next';
  if (key === 'ArrowUp') return shiftKey ? null : 'previous';
  if (key === 'Escape') return 'leave';
  const letter = key.toLowerCase();
  if (letter === 'a') return shiftKey ? 'approveAll' : 'approve';
  if (shiftKey) return null;
  return { j: 'next', k: 'previous', e: 'edit', l: 'link', o: 'open', r: 'reject' }[letter] ?? null;
}

// Where the keystrokes go into the field rather than to a shortcut. A checkbox
// counts, as Space ticks it.
export function isTypingTarget(target) {
  return Boolean(target?.isContentEditable) || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName);
}

// Whether an action still applies with focus in one of a card's fields. Letters
// never do: they are being typed, so an "a" must not approve the insight. Text
// being edited handles its own Esc, as that puts back what was there.
export function worksInField(action, target) {
  if (action === 'submit') return true;
  return action === 'leave' && !target.classList.contains('inline-input');
}

// The legend at the top of the queue. Each entry's `keys` are alternatives.
// Rejected insights don't edit in place, so that tab lists only what works there.
export function reviewLegend(tab, { mac = true } = {}) {
  const submit = mac ? '⌘↵' : 'Ctrl+↵';
  const moving = [
    { keys: ['J', '↓'], label: 'Next' },
    { keys: ['K', '↑'], label: 'Previous' },
    { keys: ['O'], label: 'Open source' },
  ];
  if (tab !== 'pending') return [...moving, { keys: ['A', submit], label: 'Approve anyway' }];
  return [
    ...moving,
    { keys: ['E'], label: 'Edit name' },
    { keys: ['Tab', '⇧Tab'], label: 'Next or previous field' },
    { keys: ['↵'], label: 'Save field' },
    { keys: ['Esc'], label: 'Cancel or back out' },
    { keys: ['L'], label: 'Link existing (type to filter, ↓ to the list, Space to tick)' },
    { keys: ['A', submit], label: 'Approve' },
    { keys: ['⇧A'], label: 'Approve + create suggested' },
    { keys: ['R'], label: 'Reject (↵ to confirm)' },
  ];
}
