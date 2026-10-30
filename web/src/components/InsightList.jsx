import { useEffect, useMemo, useRef, useState } from 'react';
import { INSIGHT_SORTS, insightFilterFields, matchesFilters } from '../lib/insightFilters.js';
import useSlashFocus from '../lib/useSlashFocus.js';
import useStuck from '../lib/useStuck.js';
import FilterBar from './FilterBar.jsx';
import InsightCard, { NewInsight } from './InsightCard.jsx';
import { PlusIcon, SearchIcon, SortIcon, TrashIcon } from './icons.jsx';

// Every insight in the account, narrowed by text search and by any of the
// fields in insightFilters.js, then sorted. Each row shows how much work leans
// on it, since the point of an insight is to be reused, and edits in place.
// New insights are added by name at the top and stay there, whatever the sort
// and filters, until the page is left, so their other fields can be filled in.
// `view` holds the search, filters and sort ({ q, filters, sort }, a null sort
// meaning the first), which the app keeps in the URL; onViewChange takes the next one.
// focusId names an insight a link pointed at: it is scrolled to and outlined.
export default function InsightList({
  view,
  onViewChange,
  insights,
  outcomes = [],
  projects = [],
  focusId,
  onCreate,
  onUpdate,
  onDelete,
}) {
  const { q: query, filters } = view;
  const sort = INSIGHT_SORTS.some((entry) => entry.id === view.sort) ? view.sort : INSIGHT_SORTS[0].id;
  const setQuery = (q) => onViewChange({ ...view, q });
  const setFilters = (next) => onViewChange({ ...view, filters: next });
  const setSort = (next) => onViewChange({ ...view, sort: next === INSIGHT_SORTS[0].id ? null : next });
  const toolbarRef = useRef(null);
  const stuck = useStuck(toolbarRef);
  const searchRef = useRef(null);
  useSlashFocus(searchRef);
  const [adding, setAdding] = useState(false);
  // Ids of the insights added here, newest first.
  const [added, setAdded] = useState([]);

  useEffect(() => {
    if (focusId == null) return;
    document.getElementById(`insight-${focusId}`)?.scrollIntoView({ block: 'center' });
  }, [focusId]);

  async function create(name) {
    const created = await onCreate({ name });
    setAdded((current) => [created.id, ...current]);
  }

  const fields = useMemo(
    () => insightFilterFields({ insights, outcomes, projects }),
    [insights, outcomes, projects],
  );

  const needle = query.trim().toLowerCase();
  const searched = needle
    ? insights.filter((insight) =>
        `${insight.name} ${insight.source ?? ''} ${insight.description ?? ''} ${insight.source_excerpt ?? ''}`
          .toLowerCase()
          .includes(needle),
      )
    : insights;
  const isAdded = (insight) => added.includes(insight.id);
  const visible = [
    ...added.map((id) => insights.find((insight) => insight.id === id)).filter(Boolean),
    ...searched
      .filter((insight) => !isAdded(insight) && matchesFilters(insight, fields, filters))
      .sort(INSIGHT_SORTS.find((entry) => entry.id === sort).compare),
  ];

  // How many insights an option would show, given the search and the other fields' filters.
  function countFor(fieldId, optionId) {
    const field = fields.find((entry) => entry.id === fieldId);
    return searched.filter(
      (insight) => field.values(insight).includes(optionId) && matchesFilters(insight, fields, filters, fieldId),
    ).length;
  }

  const filtered = needle || Object.keys(filters).length > 0;

  return (
    <>
      <div ref={toolbarRef} className={`list-toolbar${stuck ? ' stuck' : ''}`}>
        <div className="list-toolbar-row">
          <label className="search-box">
            <SearchIcon />
            <input
              ref={searchRef}
              type="search"
              value={query}
              aria-label="Search insights"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <label className="sort-select" title="Sort">
            <SortIcon />
            <select value={sort} aria-label="Sort insights" onChange={(event) => setSort(event.target.value)}>
              {INSIGHT_SORTS.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
          {/* The count and Clear hang off the right of New insight, out of
              the row's flow, so they can come and go without leaving a gap
              or re-centring the toolbar under an open filter menu. */}
          <span className="list-toolbar-end">
            <button type="button" className="with-icon" aria-label="New insight" title="New insight" onClick={() => setAdding(true)}>
              <PlusIcon />
            </button>
            <span className="list-toolbar-status">
              {filtered && <span className="id list-toolbar-count">{`${visible.length} of ${insights.length}`}</span>}
              {Object.keys(filters).length > 0 && (
                <button type="button" className="filter-clear" onClick={() => setFilters({})}>
                  Clear
                </button>
              )}
            </span>
          </span>
        </div>
        <FilterBar fields={fields} filters={filters} onChange={setFilters} countFor={countFor} showClear={false} />
      </div>
      {adding && <NewInsight onCreate={create} onClose={() => setAdding(false)} />}
      {insights.length === 0 ? (
        !adding && <p className="empty">No insights yet. Record the evidence behind your outcomes and projects.</p>
      ) : visible.length === 0 ? (
        <p className="empty">No insights match.</p>
      ) : (
        <ul className="outcome-list">
          {visible.map((insight) => (
            <li key={insight.id} id={`insight-${insight.id}`}>
              <div className={`outcome${String(insight.id) === String(focusId) ? ' focused' : ''}`}>
                <InsightCard insight={insight} outcomes={outcomes} projects={projects} onUpdate={onUpdate} />
                <div className="actions">
                  <button
                    type="button"
                    className="icon-button danger"
                    aria-label={`Delete insight ${insight.id}`}
                    title="Delete"
                    onClick={() => onDelete(insight)}
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
