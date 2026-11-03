import { useEffect, useRef, useState } from 'react';
import { SENTIMENTS, sentimentOf } from '../lib/links.js';
import { selectedFirst } from '../lib/selectedFirst.js';
import { isNumber, numberDraft } from '../lib/numberInput.js';
import LinkedText, { firstUrl } from './LinkedText.jsx';
import { ChevronDownIcon } from './icons.jsx';

// The pieces an insight edits in place with, shared by the review queue, the
// insights page and an outcome's or project's insights. Each reads as plain
// text or a tag until clicked, and saves as soon as it changes.

export const EVIDENCE = [
  { id: 'true', label: 'Firsthand' },
  { id: 'false', label: 'Relayed' },
];

// A filterable checklist of outcomes and projects behind a button; ticking one
// links the insight to it and unticking unlinks it, so several can be picked
// without reopening the menu. Items carry a `group` heading and `linked`.
// `buttonClassName` and `children` style and label the button. What's linked
// when the menu opens is listed first, under its own heading if there are groups.
export function LinkPicker({ items, disabled, onToggle, buttonClassName = 'ghost small', label, children }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [linkedOnOpen, setLinkedOnOpen] = useState(() => new Set());
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event) {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    }
    function onKeyDown(event) {
      if (event.key !== 'Escape') return;
      // Inside a modal, Esc would otherwise close the dialog as well as the menu.
      event.preventDefault();
      // Focus would otherwise drop out of the page with the menu it was in.
      if (ref.current?.contains(document.activeElement)) ref.current.querySelector('button').focus();
      setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const needle = query.trim().toLowerCase();
  const matches = needle ? items.filter((item) => item.name.toLowerCase().includes(needle)) : items;
  const groups = [...new Set(items.map((item) => item.group))];
  const searchLabel = `Search ${groups.map((group) => group.toLowerCase()).join(' and ')}`;
  const itemKey = (item) => `${item.kind}:${item.id}`;
  const wasLinked = (item) => linkedOnOpen.has(itemKey(item));
  const sections = [
    { heading: 'Selected', rows: groups.length > 1 ? matches.filter(wasLinked) : [] },
    ...groups.map((group) => {
      const inGroup = matches.filter((item) => item.group === group);
      return {
        heading: group,
        rows: groups.length > 1 ? inGroup.filter((item) => !wasLinked(item)) : selectedFirst(inGroup, wasLinked),
      };
    }),
  ];

  // Up and down walk the search box and the checkboxes; Space ticks.
  function moveInMenu(event) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const inputs = [...event.currentTarget.querySelectorAll('input')];
    const next = inputs.indexOf(document.activeElement) + (event.key === 'ArrowDown' ? 1 : -1);
    inputs[Math.min(Math.max(next, 0), inputs.length - 1)].focus();
  }

  return (
    <div className="link-existing multi-select-anchor" ref={ref}>
      <button
        type="button"
        className={buttonClassName}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => {
          setQuery('');
          setLinkedOnOpen(new Set(items.filter((item) => item.linked).map(itemKey)));
          setOpen((current) => !current);
        }}
      >
        {children} <ChevronDownIcon />
      </button>
      {open && (
        <div
          className="multi-select-menu"
          onKeyDown={moveInMenu}
          onBlur={(event) => {
            // Tabbing out closes it. A click inside moves focus nowhere, so has no related target.
            if (event.relatedTarget && !ref.current.contains(event.relatedTarget)) setOpen(false);
          }}
        >
          <input
            autoFocus
            value={query}
            placeholder={`${searchLabel}…`}
            aria-label={searchLabel}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              // Inside a form, Enter would otherwise submit it.
              if (event.key === 'Enter') event.preventDefault();
            }}
          />
          <ul role="listbox" aria-multiselectable="true" aria-label={label}>
            {matches.length === 0 && <li className="hint">No matches.</li>}
            {sections.map(({ heading, rows }) =>
              rows.length === 0
                ? null
                : [
                    groups.length > 1 && (
                      <li key={heading} className="multi-select-group" role="presentation">
                        {heading}
                      </li>
                    ),
                    ...rows.map((item) => (
                      <li key={itemKey(item)} role="option" aria-selected={item.linked}>
                        <label>
                          <input type="checkbox" checked={item.linked} onChange={() => onToggle(item)} />
                          {item.name}
                        </label>
                      </li>
                    )),
                  ],
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

// Every outcome and project as LinkPicker items, ticked when the insight
// already links to it; and the patch that flips one of them.
export function linkableItems(insight, outcomes, projects) {
  return [
    ...outcomes.map((outcome) => ({
      kind: 'outcome',
      id: Number(outcome.id),
      name: outcome.name,
      group: 'Outcomes',
      linked: insight.outcome_ids.map(String).includes(String(outcome.id)),
    })),
    ...projects.map((project) => ({
      kind: 'project',
      id: Number(project.id),
      name: project.name,
      group: 'Projects',
      linked: insight.project_ids.map(String).includes(String(project.id)),
    })),
  ];
}

export function toggleLinkPatch(insight, item) {
  const field = item.kind === 'project' ? 'project_ids' : 'outcome_ids';
  const ids = insight[field].map(Number);
  return { [field]: item.linked ? ids.filter((id) => id !== item.id) : [...ids, item.id] };
}

function OpenSourceLink({ href }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" title="Open source in a new tab" aria-label="Open source">
      ↗
    </a>
  );
}

// Where to go to check the observation: the link into the external tool when
// there is one, otherwise whatever reference was recorded. Clicking the text
// edits it; the arrow beside a link opens it, including a URL typed as the
// reference.
export function SourceLine({ insight, disabled, onSave }) {
  if (insight.source_url) {
    return (
      <span className="hint source-line">
        {disabled ? (
          <a href={insight.source_url} target="_blank" rel="noreferrer">
            {insight.source_external_id || 'Open source'}
          </a>
        ) : (
          <>
            <InlineText
              value={insight.source_url}
              display={insight.source_external_id || insight.source_url}
              label="Source link"
              className="source-link"
              // The old label named the old link, so a new link drops it.
              onCommit={(url) => onSave({ source_url: url || null, source_external_id: null })}
            />
            <OpenSourceLink href={insight.source_url} />
          </>
        )}
      </span>
    );
  }
  const reference = insight.source || insight.source_external_id;
  if (disabled) {
    return reference ? (
      <span className="hint">
        <LinkedText text={reference} />
      </span>
    ) : null;
  }
  const referenceUrl = firstUrl(reference);
  return (
    <span className="hint source-line">
      <InlineText
        value={insight.source ?? ''}
        display={reference || null}
        label="Source"
        placeholder="Add a source"
        onCommit={(source) => onSave({ source: source || null })}
      />
      {referenceUrl && <OpenSourceLink href={referenceUrl} />}
    </span>
  );
}

// A field name beside its value, e.g. "Type [Interview]".
export function PillField({ label, title, children }) {
  return (
    <span className="tag-field" title={title}>
      <span className="tag-key">{label}</span>
      {children}
    </span>
  );
}

// A choice that reads as a tag; `empty`, when given, labels the no-value option.
export function PillSelect({ label, value, options, empty, disabled, onChange }) {
  return (
    <select
      className={value ? 'cell-input pill' : 'cell-input pill empty'}
      data-value={value}
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    >
      {empty !== undefined && <option value="">{empty}</option>}
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

// A date that saves as soon as the picker sets it. A typed date saves on Enter or
// on leaving the field instead: each keystroke changes the value, so saving them
// would store year 0002 on the way to 2026 and, on the roadmap, move the row while
// it is being typed in. Escape puts back what was there.
export function DateField({ label, value, disabled, onCommit }) {
  const [draft, setDraft] = useState(null);
  const typing = useRef(false);

  function commit(next) {
    typing.current = false;
    setDraft(null);
    const incompleteYear = next && Number(next.slice(0, 4)) < 1000;
    if (next !== value && !incompleteYear) onCommit(next);
  }

  return (
    <input
      className="cell-input pill-date"
      type="date"
      aria-label={label}
      disabled={disabled}
      value={draft ?? value}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit(draft ?? value);
        } else if (event.key === 'Escape') {
          typing.current = false;
          setDraft(null);
        } else {
          typing.current = true;
        }
      }}
      onChange={(event) => {
        if (typing.current) setDraft(event.target.value);
        else commit(event.target.value);
      }}
      onBlur={() => {
        typing.current = false;
        if (draft !== null) commit(draft);
      }}
    />
  );
}

export function SentimentSelect({ value, disabled, onChange }) {
  return (
    <select
      className="cell-input sentiment-select"
      aria-label="Sentiment"
      title={sentimentOf(value)?.label ?? 'No sentiment'}
      value={value ?? ''}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value || null)}
    >
      <option value="">—</option>
      {SENTIMENTS.map((sentiment) => (
        <option key={sentiment.id} value={sentiment.id}>
          {sentiment.emoji} {sentiment.label}
        </option>
      ))}
    </select>
  );
}

// Text that becomes an input when clicked and saves when you click away or
// press Enter; Escape puts back what was there. `display`, when given, is what
// shows while it isn't being edited. `multiline` edits in a textarea that grows
// to fit (Shift+Enter for a new line); `pill` shows the value as a tag. Enter and
// Escape leave focus on the text, so the keyboard carries on from where it was.
export function InlineText({ value, label, display, placeholder = '', type = 'text', required, multiline, pill, className = '', disabled, onCommit }) {
  const [draft, setDraft] = useState(null);
  // Set by Escape, so the blur that follows doesn't save.
  const cancelled = useRef(false);
  const restoreFocus = useRef(false);
  const shownRef = useRef(null);
  useEffect(() => {
    if (draft !== null || !restoreFocus.current) return;
    restoreFocus.current = false;
    shownRef.current?.focus();
  }, [draft]);
  const current = String(value);
  const shown = display ?? current;

  if (disabled || draft === null) {
    const empty = !shown;
    if (disabled && empty) return pill ? <span className="tag project empty">—</span> : null;
    const classes = [
      pill ? 'tag project' : '',
      empty ? 'empty' : '',
      disabled ? '' : 'inline-edit',
      className,
    ].filter(Boolean).join(' ');
    if (disabled) return <span className={classes}>{shown}</span>;
    return (
      <span
        ref={shownRef}
        className={classes}
        role="button"
        tabIndex={0}
        aria-label={`Edit ${label.toLowerCase()}`}
        title="Click to edit"
        onClick={() => setDraft(current)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setDraft(current);
          }
        }}
      >
        {empty ? placeholder : shown}
      </span>
    );
  }

  function commit() {
    const next = draft.trim();
    setDraft(null);
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    if (next === current || (required && !next)) return;
    if (type === 'number' && next && !isNumber(next)) return;
    onCommit(next);
  }

  function onKeyDown(event) {
    if (event.key === 'Enter' && !(multiline && event.shiftKey)) {
      event.preventDefault();
      restoreFocus.current = true;
      event.currentTarget.blur();
    }
    if (event.key === 'Escape') {
      cancelled.current = true;
      restoreFocus.current = true;
      event.currentTarget.blur();
    }
  }

  // Focus puts a textarea's caret at the start; carry on typing from the end.
  function caretToEnd(event) {
    const { length } = event.target.value;
    event.target.setSelectionRange(length, length);
  }

  const classes = `cell-input inline-input${pill ? ' pill-input' : ''} ${className}`.trim();
  return multiline ? (
    <textarea
      className={classes}
      rows={1}
      autoFocus
      aria-label={label}
      value={draft}
      ref={fitHeight}
      onChange={(event) => {
        setDraft(event.target.value);
        fitHeight(event.target);
      }}
      onFocus={caretToEnd}
      onBlur={commit}
      onKeyDown={onKeyDown}
    />
  ) : (
    <input
      className={classes}
      type={type === 'number' ? 'text' : type}
      inputMode={type === 'number' ? 'decimal' : undefined}
      autoFocus
      aria-label={label}
      value={draft}
      onChange={(event) => setDraft(type === 'number' ? numberDraft(event.target.value) : event.target.value)}
      onFocus={caretToEnd}
      onBlur={commit}
      onKeyDown={onKeyDown}
    />
  );
}

export function fitHeight(textarea) {
  if (!textarea) return;
  textarea.style.height = 'auto';
  textarea.style.height = `${textarea.scrollHeight + 2}px`;
}
