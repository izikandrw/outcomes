import { useMemo, useRef } from 'react';
import { impactFilterFields } from '../lib/impactFilters.js';
import { matchesFilters } from '../lib/insightFilters.js';
import { outcomesForImpact, targetsForImpact } from '../lib/links.js';
import useSlashFocus from '../lib/useSlashFocus.js';
import useStuck from '../lib/useStuck.js';
import ChildCoverage from './ChildCoverage.jsx';
import FilterBar from './FilterBar.jsx';
import { Target } from './OutcomeList.jsx';
import { PencilIcon, PlusIcon, SearchIcon, TrashIcon } from './icons.jsx';

// Flat list of every impact, laid out like the outcome list. A child names its
// parent impact rather than being indented under it, and the outcomes driving
// each impact are tagged so one with nothing rolling up to it stands out. A
// toolbar above narrows the list by text and by the fields in impactFilters.js.
export default function ImpactList({
  view,
  onViewChange,
  impacts,
  allImpacts = impacts,
  outcomes,
  teams,
  projects,
  targets,
  insights,
  suggestions,
  issues,
  onCreate,
  onEdit,
  onDelete,
  onAddTarget,
  onEditTarget,
  onDeleteTarget,
  onViewTarget,
}) {
  const nameOf = (id) => allImpacts.find((item) => String(item.id) === String(id))?.name ?? null;
  // The search and filters ({ q, filters }), which the app keeps in the URL.
  const { q: query, filters } = view;
  const setQuery = (q) => onViewChange({ ...view, q });
  const setFilters = (next) => onViewChange({ ...view, filters: next });
  const toolbarRef = useRef(null);
  const stuck = useStuck(toolbarRef);
  const searchRef = useRef(null);
  useSlashFocus(searchRef);

  const fields = useMemo(
    () =>
      impactFilterFields({ impacts: allImpacts, outcomes, teams, projects, targets, insights, suggestions, issues }),
    [allImpacts, outcomes, teams, projects, targets, insights, suggestions, issues],
  );

  const needle = query.trim().toLowerCase();
  const searched = needle
    ? impacts.filter((impact) =>
        `${impact.name} ${impact.description ?? ''} #${impact.id}`.toLowerCase().includes(needle),
      )
    : impacts;
  const visible = searched.filter((impact) => matchesFilters(impact, fields, filters));

  // How many impacts an option would show, given the search and the other fields' filters.
  function countFor(fieldId, optionId) {
    const field = fields.find((entry) => entry.id === fieldId);
    return searched.filter(
      (impact) => field.values(impact).includes(optionId) && matchesFilters(impact, fields, filters, fieldId),
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
              aria-label="Search impacts"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          {/* The count and Clear hang off the right of New impact, as on the outcome list. */}
          <span className="list-toolbar-end">
            <button type="button" className="with-icon btn-impact" onClick={onCreate}>
              <PlusIcon />
              New impact
            </button>
            <span className="list-toolbar-status">
              {filtered && <span className="id list-toolbar-count">{`${visible.length} of ${impacts.length}`}</span>}
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
      {visible.length === 0 ? (
        <p className="empty">No impacts match.</p>
      ) : (
        <ul className="outcome-list">
          {visible.map((impact) => {
            const driving = outcomesForImpact(outcomes, impact);
            const impactTargets = targetsForImpact(targets, impact);
            return (
              <li key={impact.id}>
                <div className="outcome">
                  <div>
                    <h3>{impact.name}</h3>
                    {impact.description && <p className="description">{impact.description}</p>}
                    <p className="meta">
                      {driving.map((outcome) => (
                        <span className="tag" key={outcome.id}>
                          {outcome.name}
                        </span>
                      ))}
                      {impact.parent_impact_id && nameOf(impact.parent_impact_id) && (
                        <span className="tag parent">↳ {nameOf(impact.parent_impact_id)}</span>
                      )}
                      <span className="id">#{impact.id}</span>
                    </p>
                  </div>
                  <div className="actions">
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Edit ${impact.name}`}
                      title="Edit"
                      onClick={() => onEdit(impact)}
                    >
                      <PencilIcon />
                    </button>
                    <button
                      type="button"
                      className="icon-button danger"
                      aria-label={`Delete ${impact.name}`}
                      title="Delete"
                      onClick={() => onDelete(impact)}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </div>

                <div className="targets">
                  {impactTargets.length === 0 ? (
                    <p className="empty no-targets">
                      No target yet — nothing here says what business result this is worth.
                    </p>
                  ) : (
                    <ul className="target-list">
                      {impactTargets.map((target) => (
                        <Target
                          key={target.id}
                          target={target}
                          onView={() => onViewTarget(target)}
                          onEdit={() => onEditTarget(target, impact, 'impact')}
                          onDelete={() => onDeleteTarget(target)}
                        >
                          <ChildCoverage
                            kind="impact"
                            entity={impact}
                            target={target}
                            collections={{ impacts: allImpacts, outcomes, projects, targets }}
                          />
                        </Target>
                      ))}
                    </ul>
                  )}
                  <button type="button" className="ghost with-icon small" onClick={() => onAddTarget(impact)}>
                    <PlusIcon />
                    Add target
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
