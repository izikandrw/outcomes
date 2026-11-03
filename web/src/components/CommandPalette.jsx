import { useEffect, useMemo, useRef, useState } from 'react';
import { KIND_LABELS, isPaletteShortcut, paletteEntries, searchEntries } from '../lib/commandPalette.js';
import { SearchIcon } from './icons.jsx';

const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform);
// A broad word can find hundreds of insights; nobody reads past the best of them.
const MAX_SHOWN = 50;

// Opens it with the mouse. Just an icon, as the header has no room for words.
export function CommandPaletteButton({ onClick }) {
  return (
    <button
      type="button"
      className="icon-button palette-button"
      title={`Jump to a page or search for anything (${isMac() ? '⌘K' : 'Ctrl+K'})`}
      aria-label="Search"
      onClick={onClick}
    >
      <SearchIcon />
    </button>
  );
}

// Jumps to a page, or to any one item by searching for it. `data` is what can be
// searched; `onGo` gets the entry picked (see lib/commandPalette.js).
//
// It doesn't open over a modal, as the nav can't be reached from one either and
// jumping away would drop what is being typed in its form. It does open over the
// map's side panel, which leaves the nav clickable.
export default function CommandPalette({ open, onOpenChange, data, loading, onGo }) {
  useEffect(() => {
    function onKeyDown(event) {
      if (!isPaletteShortcut(event, { mac: isMac() })) return;
      event.preventDefault();
      if (event.repeat) return;
      if (open) onOpenChange(false);
      else if (!document.querySelector('dialog:modal')) onOpenChange(true);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange]);

  if (!open) return null;
  return <PaletteDialog data={data} loading={loading} onGo={onGo} onClose={() => onOpenChange(false)} />;
}

function PaletteDialog({ data, loading, onGo, onClose }) {
  const dialogRef = useRef(null);
  const inputRef = useRef(null);
  const pressedBackdrop = useRef(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  const entries = useMemo(() => paletteEntries(data), [data]);
  const found = useMemo(() => searchEntries(entries, query), [entries, query]);
  const shown = found.slice(0, MAX_SHOWN);
  const current = shown[Math.min(active, shown.length - 1)];

  // Removing a <dialog> doesn't hand focus back the way closing one does, so
  // whatever was being worked in gets it back here. Read while rendering, as by
  // the time an effect re-runs in StrictMode the focus is already in here.
  const [opener] = useState(() => document.activeElement);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog.open) dialog.showModal();
    inputRef.current.focus();
    document.body.classList.add('modal-open');
    return () => {
      document.body.classList.remove('modal-open');
      opener?.focus?.();
    };
  }, [opener]);

  useEffect(() => {
    if (current) document.getElementById(`palette-${current.key}`)?.scrollIntoView({ block: 'nearest' });
  }, [current]);

  function onInputKeyDown(event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (shown.length === 0) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((Math.min(active, shown.length - 1) + step + shown.length) % shown.length);
    } else if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (current) onGo(current);
    } else if (event.key === 'Tab') {
      // Nothing else in here takes focus; arrows move through the results.
      event.preventDefault();
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="modal palette"
      aria-label="Search"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onPointerDown={(event) => {
        pressedBackdrop.current = event.target === dialogRef.current;
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current && pressedBackdrop.current) onClose();
      }}
    >
      <div className="palette-search">
        <SearchIcon />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label="Jump to a page or search for anything"
          aria-expanded="true"
          aria-autocomplete="list"
          aria-controls="palette-results"
          aria-activedescendant={current ? `palette-${current.key}` : undefined}
          placeholder="Jump to a page or search for anything…"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onInputKeyDown}
        />
      </div>
      {shown.length > 0 ? (
        <ul id="palette-results" className="palette-results" role="listbox" aria-label="Results">
          {shown.map((entry, index) => (
            <li
              key={entry.key}
              id={`palette-${entry.key}`}
              className="palette-result"
              role="option"
              aria-selected={entry === current}
              // Only a mouse that really moved: scrolling the list with the
              // arrows slides rows under a still one.
              onMouseMove={(event) => {
                if (event.movementX || event.movementY) setActive(index);
              }}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onGo(entry)}
            >
              <span className="palette-result-text">
                <span className="palette-result-name">{entry.name}</span>
                {entry.detail && <span className="palette-result-detail">{entry.detail}</span>}
              </span>
              <span className="palette-kind" data-kind={entry.kind}>
                {entry.suggested ? 'Suggested insight' : KIND_LABELS[entry.kind]}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty palette-empty">{loading ? 'Still loading…' : `Nothing matches “${query.trim()}”.`}</p>
      )}
      <div className="palette-foot">
        <span className="shortcut">
          <kbd>↑</kbd>
          <kbd>↓</kbd>
          Move
        </span>
        <span className="shortcut">
          <kbd>↵</kbd>
          Open
        </span>
        <span className="shortcut">
          <kbd>Esc</kbd>
          Close
        </span>
        {found.length > shown.length && (
          <span className="palette-count">
            Best {shown.length} of {found.length}
          </span>
        )}
      </div>
    </dialog>
  );
}
