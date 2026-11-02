import { useEffect, useRef, useState } from 'react';
import { selectedFirst } from '../lib/selectedFirst.js';
import { ChevronDownIcon } from './icons.jsx';

// A dropdown for picking several items: the closed state shows the picks as
// removable chips, and the menu has a filter box for long lists and lists the
// picks first. `selected` is a Set of string ids, matching how the forms keep
// link ids.
export default function MultiSelect({ label, items, selected, onChange, placeholder = 'Select…' }) {
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedOnOpen, setSelectedOnOpen] = useState(() => new Set());
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event) {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    }
    function onKeyDown(event) {
      // Close the menu without letting the Escape also close the modal around it.
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function toggleOpen() {
    if (items.length === 0) return;
    if (!open) {
      // These sit at the bottom of a scrolling modal, so open upward when the
      // menu would otherwise run off the bottom of the screen.
      const rect = ref.current.getBoundingClientRect();
      setDropUp(window.innerHeight - rect.bottom < 300 && rect.top > window.innerHeight - rect.bottom);
      setQuery('');
      setSelectedOnOpen(new Set(selected));
    }
    setOpen((current) => !current);
  }

  function toggle(id) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  }

  const picked = items.filter((item) => selected.has(String(item.id)));
  const needle = query.trim().toLowerCase();
  const options = selectedFirst(
    needle ? items.filter((item) => item.name.toLowerCase().includes(needle)) : items,
    (item) => selectedOnOpen.has(String(item.id)),
  );

  return (
    <div className="multi-select" ref={ref}>
      <span className="multi-select-label">{label}</span>
      <div className="multi-select-anchor">
        <div
          className={`multi-select-control${open ? ' open' : ''}`}
          onClick={(event) => {
            if (!event.target.closest('.multi-select-chip button')) toggleOpen();
          }}
        >
          {picked.length === 0 ? (
            <span className="multi-select-placeholder">{items.length === 0 ? 'None yet.' : placeholder}</span>
          ) : (
            picked.map((item) => (
              <span key={item.id} className="multi-select-chip">
                {item.name}
                <button type="button" aria-label={`Remove ${item.name}`} onClick={() => toggle(String(item.id))}>
                  ×
                </button>
              </span>
            ))
          )}
          <button
            type="button"
            className="multi-select-toggle"
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-label={`Choose ${label.toLowerCase()}`}
            disabled={items.length === 0}
          >
            <ChevronDownIcon />
          </button>
        </div>

        {open && (
          <div className={`multi-select-menu${dropUp ? ' up' : ''}`}>
            <input
              autoFocus
              value={query}
              placeholder="Filter…"
              onChange={(event) => setQuery(event.target.value)}
              // Enter would otherwise submit the form the dropdown sits in.
              onKeyDown={(event) => event.key === 'Enter' && event.preventDefault()}
            />
            <ul role="listbox" aria-multiselectable="true">
              {options.length === 0 && <li className="hint">No matches.</li>}
              {options.map((item) => {
                const id = String(item.id);
                return (
                  <li key={item.id} role="option" aria-selected={selected.has(id)}>
                    <label>
                      <input type="checkbox" checked={selected.has(id)} onChange={() => toggle(id)} />
                      {item.name}
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
