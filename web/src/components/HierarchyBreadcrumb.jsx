import { useEffect, useRef, useState } from 'react';
import { ancestorMoves, lineage, nameOf, otherLinkedParents, parentChoices, refKey } from '../lib/hierarchy.js';
import { selectedFirst } from '../lib/selectedFirst.js';
import { PencilIcon } from './icons.jsx';

const GROUP_LABELS = { impact: 'Impacts', outcome: 'Outcomes', project: 'Projects', team: 'Teams' };

// Sits where the modal title was: the item's ancestors, root first, then the
// heading. Clicking a crumb opens that ancestor. Given `onMove`, hovering or
// focusing a crumb also shows a pencil opening a searchable list to swap it for
// another, and the leading + adds a parent above the top. Swaps only show here until the form is
// saved, so Cancel undoes them. Without a `heading`, the last crumb names what's open.
export default function HierarchyBreadcrumb({ heading, start, collections, moves, onMove, onOpen }) {
  // The ref whose parent the open menu is choosing.
  const [choosingFor, setChoosingFor] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    if (!choosingFor) return;
    function onPointerDown(event) {
      if (ref.current && !ref.current.contains(event.target)) setChoosingFor(null);
    }
    function onKeyDown(event) {
      // Close the menu without letting the Escape also close the modal around it.
      if (event.key === 'Escape') {
        event.preventDefault();
        setChoosingFor(null);
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [choosingFor]);

  const chain = lineage(start, collections, moves);
  const top = chain[0] ? { kind: chain[0].kind, id: chain[0].id } : start;
  const canAddAbove = onMove && parentChoices(top, collections, moves).some((group) => group.items.length > 0);
  const isChoosing = (child) => choosingFor && refKey(choosingFor) === refKey(child);
  const toggle = (child) => setChoosingFor(isChoosing(child) ? null : child);
  const label = (child) => nameOf(child, collections) ?? `this ${child.kind}`;
  const staged = onMove ? ancestorMoves(start, collections, moves) : [];
  const alsoDrives = otherLinkedParents(start, collections, moves);

  return (
    <nav className="crumbs" aria-label="Hierarchy" ref={ref}>
      <ol>
        {canAddAbove && (
          <li>
            <button
              type="button"
              className="crumb crumb-add"
              aria-haspopup="listbox"
              aria-expanded={Boolean(isChoosing(top))}
              aria-label={`Add a parent above ${label(top)}`}
              onClick={() => toggle(top)}
            >
              {chain.length > 0 ? '+' : '+ Add parent'}
            </button>
          </li>
        )}
        {chain.map((crumb) => (
          <li key={refKey(crumb)} data-kind={crumb.kind}>
            <button
              type="button"
              className="crumb crumb-link"
              title={`Open ${crumb.name}`}
              onClick={() => onOpen({ kind: crumb.kind, id: crumb.id })}
            >
              <span className="crumb-name">{crumb.name}</span>
            </button>
            {onMove && (
              <button
                type="button"
                className="crumb crumb-swap"
                title={crumb.linked ? `Add another parent to ${label(crumb.child)}` : `Change the parent of ${label(crumb.child)}`}
                aria-haspopup="listbox"
                aria-expanded={Boolean(isChoosing(crumb.child))}
                aria-label={
                  crumb.linked
                    ? `Add another parent to ${label(crumb.child)}`
                    : `Change the parent of ${label(crumb.child)}, now ${crumb.name}`
                }
                onClick={() => toggle(crumb.child)}
              >
                <PencilIcon />
              </button>
            )}
          </li>
        ))}
        {heading && (
          <li aria-current="page">
            <h2>{heading}</h2>
          </li>
        )}
      </ol>

      {alsoDrives.length > 0 && (
        <p className="hint crumbs-hint crumbs-also">
          Also drives{' '}
          {alsoDrives.map((linked, index) => (
            <span key={refKey(linked)}>
              {index > 0 && ', '}
              <button type="button" onClick={() => onOpen({ kind: linked.kind, id: linked.id })}>
                {linked.name}
              </button>
            </span>
          ))}
        </p>
      )}

      {staged.length > 0 && (
        <p className="hint crumbs-hint">
          {staged.map(({ child, parent }) => (
            <span key={refKey(child)}>
              Saving also moves “{label(child)}” {parent ? `under “${label(parent)}”` : 'to the top level'}.{' '}
            </span>
          ))}
        </p>
      )}

      {choosingFor && (
        <ParentMenu
          key={refKey(choosingFor)}
          childLabel={label(choosingFor)}
          // A link to an outcome isn't a parent, so there is none to clear or mark.
          current={chain.find((crumb) => !crumb.linked && refKey(crumb.child) === refKey(choosingFor)) ?? null}
          groups={parentChoices(choosingFor, collections, moves)}
          onChoose={(parent) => {
            onMove(choosingFor, parent);
            setChoosingFor(null);
          }}
        />
      )}
    </nav>
  );
}

function ParentMenu({ childLabel, current, groups, onChoose }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(null);
  const listRef = useRef(null);

  const needle = query.trim().toLowerCase();
  const isCurrent = (kind, item) => current?.kind === kind && String(current.id) === String(item.id);
  const shown = groups
    .map(({ kind, items }) => ({
      kind,
      items: selectedFirst(
        needle ? items.filter((item) => item.name.toLowerCase().includes(needle)) : items,
        (item) => isCurrent(kind, item),
      ),
    }))
    .filter((group) => group.items.length > 0);
  const noParent = 'no parent (top level)';
  const showNone = current && (!needle || noParent.includes(needle));

  // Every row in display order, so the arrow keys and Enter can walk them.
  const rows = [
    ...(showNone ? [{ key: 'none', parent: null }] : []),
    ...shown.flatMap(({ kind, items }) =>
      items.map((item) => ({ key: `${kind}-${item.id}`, parent: { kind, id: item.id } })),
    ),
  ];
  // Opens on the current parent, so Enter straight away changes nothing; once
  // searching, on the best match.
  const startIndex = needle ? 0 : Math.max(0, rows.findIndex(({ parent }) => parent && isCurrent(parent.kind, parent)));
  const activeIndex = Math.min(active ?? startIndex, rows.length - 1);
  const activeKey = rows[activeIndex]?.key;

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [activeKey]);

  function onKeyDown(event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (rows.length === 0) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((activeIndex + step + rows.length) % rows.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const row = rows.find((candidate) => candidate.key === activeKey);
      if (row) onChoose(row.parent);
    }
  }

  const option = (key, parent, name, selected) => (
    <li key={key} role="option" aria-selected={selected} className="crumb-option" data-active={key === activeKey}>
      <button type="button" title={name} onClick={() => onChoose(parent)}>
        {name}
      </button>
    </li>
  );

  return (
    <div className="multi-select-menu crumbs-menu">
      <span className="hint">Parent of {childLabel}</span>
      <input
        autoFocus
        value={query}
        placeholder="Search…"
        aria-label={`Search for a parent of ${childLabel}`}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(null);
        }}
        onKeyDown={onKeyDown}
      />
      <ul role="listbox" ref={listRef}>
        {rows.length === 0 && <li className="hint">No matches.</li>}
        {showNone && option('none', null, 'No parent (top level)', false)}
        {shown.map(({ kind, items }) => [
          shown.length > 1 && (
            <li key={`group-${kind}`} className="multi-select-group" role="presentation">
              {GROUP_LABELS[kind]}
            </li>
          ),
          ...items.map((item) =>
            option(`${kind}-${item.id}`, { kind, id: item.id }, item.name, Boolean(isCurrent(kind, item))),
          ),
        ])}
      </ul>
    </div>
  );
}
