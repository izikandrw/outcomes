import { useMemo, useRef, useState } from 'react';
import { formatDollars, impactAreaLabel, insightTypeLabel } from '../lib/links.js';
import { INSIGHT_SORTS, insightFilterFields, matchesFilters } from '../lib/insightFilters.js';
import useStuck from '../lib/useStuck.js';
import FilterBar from './FilterBar.jsx';
import SentimentBadge from './SentimentBadge.jsx';
import { PencilIcon, PlusIcon, SearchIcon, SortIcon, TrashIcon } from './icons.jsx';
import LinkedText from './LinkedText.jsx';

// Every insight in the account, narrowed by text search and by any of the
// fields in insightFilters.js, then sorted. Each row shows how much work leans
// on it, since the point of an insight is to be reused.
export default function InsightList({ insights, outcomes = [], projects = [], onCreate, onEdit, onDelete }) {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState(INSIGHT_SORTS[0].id);
  const toolbarRef = useRef(null);
  const stuck = useStuck(toolbarRef);

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
  const visible = searched
    .filter((insight) => matchesFilters(insight, fields, filters))
    .sort(INSIGHT_SORTS.find((entry) => entry.id === sort).compare);

  // How many insights an option would show, given the search and the other fields' filters.
  function countFor(fieldId, optionId) {
    const field = fields.find((entry) => entry.id === fieldId);
    return searched.filter(
      (insight) => field.values(insight).includes(optionId) && matchesFilters(insight, fields, filters, fieldId),
    ).length;
  }

  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const filtered = needle || Object.keys(filters).length > 0;

  return (
    <>
      <div ref={toolbarRef} className={`list-toolbar${stuck ? ' stuck' : ''}`}>
        <div className="list-toolbar-row">
          <label className="search-box">
            <SearchIcon />
            <input
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
            <button type="button" className="with-icon" aria-label="New insight" title="New insight" onClick={onCreate}>
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
      {insights.length === 0 ? (
        <p className="empty">No insights yet. Record the evidence behind your outcomes and projects.</p>
      ) : visible.length === 0 ? (
        <p className="empty">No insights match.</p>
      ) : (
        <ul className="outcome-list">
          {visible.map((insight) => (
            <li key={insight.id}>
              <div className="outcome">
                <div>
                  <h3>
                    <SentimentBadge sentiment={insight.sentiment} /> {insight.name}
                  </h3>
                  <p className="meta">
                    {insight.status === 'unvalidated' && (
                      <span className="tag parent" title="Waiting for review; not counted as evidence yet">
                        Suggested
                      </span>
                    )}
                    <span className="tag">{insightTypeLabel(insight.type)}</span>
                    <span className="tag">{plural(insight.outcome_ids.length, 'outcome')}</span>
                    <span className="tag project">{plural(insight.project_ids.length, 'project')}</span>
                    {insight.impact_area && <span className="tag">{impactAreaLabel(insight.impact_area)}</span>}
                    {insight.dollar_impact != null && (
                      <span className="tag">{formatDollars(insight.dollar_impact)}</span>
                    )}
                    {insight.observed_at && (
                      <span className="id">{new Date(insight.observed_at).toISOString().slice(0, 10)}</span>
                    )}
                    <span className="id">#{insight.id}</span>
                  </p>
                  {insight.source_excerpt && <blockquote className="excerpt">“{insight.source_excerpt}”</blockquote>}
                  {insight.source && (
                    <p className="hint">
                      <LinkedText text={insight.source} />
                    </p>
                  )}
                </div>
                <div className="actions">
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Edit insight ${insight.id}`}
                    title="Edit"
                    onClick={() => onEdit(insight)}
                  >
                    <PencilIcon />
                  </button>
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
