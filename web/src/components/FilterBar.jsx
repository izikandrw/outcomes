import { useEffect, useRef, useState } from 'react';
import { CloseIcon, FilterIcon } from './icons.jsx';

// A "Filter" button that opens a menu of fields, then the options of the field
// picked, plus a chip for each field in use ("Type: Interview, Survey") that
// reopens its options or clears it. `filters` maps a field id to the option
// ids picked; `countFor(fieldId, optionId)` gives the count beside an option.
export default function FilterBar({ fields, filters, onChange, countFor }) {
  // Which menu is open: 'add' for the Filter button, or a field id for a chip.
  const [open, setOpen] = useState(null);
  const active = fields.filter((field) => filters[field.id]?.length);

  function setField(fieldId, picked) {
    const next = { ...filters };
    if (picked.length) next[fieldId] = picked;
    else delete next[fieldId];
    onChange(next);
  }

  return (
    <div className="filter-bar">
      <Anchor open={open === 'add'} onClose={() => setOpen(null)}>
        <button
          type="button"
          className="ghost with-icon filter-button"
          aria-haspopup="menu"
          aria-expanded={open === 'add'}
          onClick={() => setOpen(open === 'add' ? null : 'add')}
        >
          <FilterIcon />
          Filter
        </button>
        <FieldPicker fields={fields} filters={filters} onPick={setField} countFor={countFor} />
      </Anchor>

      {active.map((field) => {
        const picked = filters[field.id];
        const labels = field.options.filter((option) => picked.includes(option.id)).map((option) => option.label);
        return (
          <Anchor key={field.id} open={open === field.id} onClose={() => setOpen(null)}>
            <span className="filter-chip">
              <button
                type="button"
                className="filter-chip-body"
                aria-haspopup="listbox"
                aria-expanded={open === field.id}
                title={labels.join(', ')}
                onClick={() => setOpen(open === field.id ? null : field.id)}
              >
                <span className="filter-chip-key">{field.label}</span>
                <span className="filter-chip-value">{labels.length > 2 ? `${labels.length} selected` : labels.join(', ')}</span>
              </button>
              <button
                type="button"
                className="filter-chip-remove"
                aria-label={`Clear ${field.label.toLowerCase()} filter`}
                onClick={() => setField(field.id, [])}
              >
                <CloseIcon />
              </button>
            </span>
            <OptionList field={field} picked={picked} onChange={(next) => setField(field.id, next)} countFor={countFor} />
          </Anchor>
        );
      })}

      {active.length > 0 && (
        <button type="button" className="filter-clear" onClick={() => onChange({})}>
          Clear
        </button>
      )}
    </div>
  );
}

// The Filter button's menu: the fields first, then the options of the one picked.
function FieldPicker({ fields, filters, onPick, countFor }) {
  const [fieldId, setFieldId] = useState(null);
  const field = fields.find((entry) => entry.id === fieldId);

  if (field) {
    return (
      <>
        <button type="button" className="filter-menu-back" onClick={() => setFieldId(null)}>
          ‹ {field.label}
        </button>
        <OptionList
          field={field}
          picked={filters[field.id] ?? []}
          onChange={(next) => onPick(field.id, next)}
          countFor={countFor}
        />
      </>
    );
  }
  return (
    <ul className="filter-menu-list" role="menu">
      {fields.map((entry) => (
        <li key={entry.id}>
          <button type="button" role="menuitem" className="filter-menu-item" onClick={() => setFieldId(entry.id)}>
            <span>{entry.label}</span>
            {filters[entry.id]?.length > 0 && <span className="filter-menu-count">{filters[entry.id].length}</span>}
            <span className="filter-menu-arrow">›</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

// Checkboxes for one field's options, each with how many insights it would show.
// Long lists (outcomes, projects, teams) get a box to narrow them.
function OptionList({ field, picked, onChange, countFor }) {
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const options = needle ? field.options.filter((option) => option.label.toLowerCase().includes(needle)) : field.options;

  function toggle(id) {
    onChange(picked.includes(id) ? picked.filter((entry) => entry !== id) : [...picked, id]);
  }

  return (
    <>
      {field.searchable && field.options.length > 6 && (
        <input
          autoFocus
          value={query}
          placeholder={`Find ${field.label.toLowerCase()}…`}
          aria-label={`Find ${field.label.toLowerCase()}`}
          onChange={(event) => setQuery(event.target.value)}
        />
      )}
      <ul role="listbox" aria-multiselectable="true" aria-label={field.label} className="filter-menu-list">
        {options.length === 0 && <li className="hint filter-menu-empty">No matches.</li>}
        {options.map((option) => {
          const count = countFor(field.id, option.id);
          const checked = picked.includes(option.id);
          return (
            <li key={option.id} role="option" aria-selected={checked}>
              <label className={`filter-option${count === 0 && !checked ? ' none' : ''}`}>
                <input type="checkbox" checked={checked} onChange={() => toggle(option.id)} />
                <span className="filter-option-label">{option.label}</span>
                <span className="filter-menu-count">{count}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </>
  );
}

// Positions a menu under its trigger (the first child) and closes it on an
// outside click or Escape. The menu (the rest) mounts only while open, so the
// Filter menu starts back at the field list each time.
function Anchor({ open, onClose, children }) {
  const ref = useRef(null);
  const [trigger, ...menu] = Array.isArray(children) ? children : [children];

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event) {
      if (ref.current && !ref.current.contains(event.target)) onClose();
    }
    function onKeyDown(event) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  return (
    <div className="filter-anchor" ref={ref}>
      {trigger}
      {open && <div className="filter-menu">{menu}</div>}
    </div>
  );
}
