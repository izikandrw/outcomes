import { useEffect, useRef, useState } from 'react';
import { ChevronDownIcon } from './icons.jsx';

// Sits where the modal title used to be: a Jira-style breadcrumb tag showing
// the outcome's parent, clickable to reassign it without leaving the modal.
export default function ParentOutcomeTag({ outcomes, editingId, value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event) {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    }
    function onKeyDown(event) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const options = outcomes.filter((outcome) => !isDescendant(outcome, editingId, outcomes));
  const current = outcomes.find((outcome) => String(outcome.id) === String(value));

  function choose(id) {
    onChange(id);
    setOpen(false);
  }

  return (
    <div className="parent-tag" ref={ref}>
      <button
        type="button"
        className="parent-tag-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {current ? (
          <>
            <span className="parent-tag-label">Parent</span>
            <span className="parent-tag-value">{current.name}</span>
          </>
        ) : (
          <span className="parent-tag-value muted">+ Add parent</span>
        )}
        <ChevronDownIcon />
      </button>

      {open && (
        <ul className="parent-tag-menu" role="listbox">
          <li role="option" aria-selected={!value}>
            <button type="button" onClick={() => choose('')}>
              No parent (top level)
            </button>
          </li>
          {options.map((outcome) => (
            <li key={outcome.id} role="option" aria-selected={String(outcome.id) === String(value)}>
              <button type="button" onClick={() => choose(String(outcome.id))}>
                {outcome.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// An outcome cannot be its own parent, and the API has no cycle check, so
// descendants of the outcome being edited are filtered out of the list too.
function isDescendant(candidate, editingId, outcomes) {
  if (!editingId) return false;
  let current = candidate;
  const seen = new Set();
  while (current && !seen.has(current.id)) {
    if (String(current.id) === String(editingId)) return true;
    seen.add(current.id);
    current = outcomes.find((outcome) => outcome.id === current.parent_outcome_id);
  }
  return false;
}
