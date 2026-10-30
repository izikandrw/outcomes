import { useMemo, useRef, useState } from 'react';
import {
  formatValue,
  insightsForOutcome,
  progressOf,
  projectsForOutcome,
  targetLabel,
  targetRange,
  targetsForOutcome,
  teamsOnOutcome,
  totalDollarImpact,
} from '../lib/links.js';
import { matchesFilters } from '../lib/insightFilters.js';
import { outcomeFilterFields } from '../lib/outcomeFilters.js';
import useStuck from '../lib/useStuck.js';
import FilterBar from './FilterBar.jsx';
import InsightBadge from './InsightBadge.jsx';
import TeamChips from './TeamChips.jsx';
import { PencilIcon, PlusIcon, SearchIcon, TrashIcon } from './icons.jsx';

// Flat list of every outcome. Nesting is shown by the tree view instead, so a
// child names its parent here rather than being indented under it. Targets are
// listed under their outcome, because a behavior change with no numbers on it
// is the thing this view most needs to make obvious. A toolbar above narrows
// the list by text and by the fields in outcomeFilters.js.
export default function OutcomeList({
  outcomes,
  teams,
  projects,
  impacts = [],
  targets,
  insights,
  suggestions,
  issues,
  onCreate,
  onEdit,
  onDelete,
  onShowInsights,
  onOpenTeam,
  onAddTarget,
  onEditTarget,
  onDeleteTarget,
  onViewTarget,
}) {
  const nameOf = (collection, id) => collection.find((item) => item.id === id)?.name ?? null;
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState({});
  const toolbarRef = useRef(null);
  const stuck = useStuck(toolbarRef);

  const fields = useMemo(
    () => outcomeFilterFields({ outcomes, teams, projects, impacts, targets, insights, suggestions, issues }),
    [outcomes, teams, projects, impacts, targets, insights, suggestions, issues],
  );

  const needle = query.trim().toLowerCase();
  const searched = needle
    ? outcomes.filter((outcome) =>
        `${outcome.name} ${outcome.description ?? ''} #${outcome.id}`.toLowerCase().includes(needle),
      )
    : outcomes;
  const visible = searched.filter((outcome) => matchesFilters(outcome, fields, filters));

  // How many outcomes an option would show, given the search and the other fields' filters.
  function countFor(fieldId, optionId) {
    const field = fields.find((entry) => entry.id === fieldId);
    return searched.filter(
      (outcome) => field.values(outcome).includes(optionId) && matchesFilters(outcome, fields, filters, fieldId),
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
              type="search"
              value={query}
              placeholder={`Search ${outcomes.length} outcome${outcomes.length === 1 ? '' : 's'}`}
              aria-label="Search outcomes"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          {/* Always holds its widest width, shown or not, so filtering never
              re-centres or re-wraps the toolbar under an open filter menu. */}
          <span
            className="id list-toolbar-count"
            style={{ minWidth: `${`${outcomes.length} of ${outcomes.length}`.length}ch`, visibility: filtered ? 'visible' : 'hidden' }}
          >
            {`${visible.length} of ${outcomes.length}`}
          </span>
          <button type="button" className="with-icon btn-outcome" onClick={onCreate}>
            <PlusIcon />
            New outcome
          </button>
        </div>
        <FilterBar fields={fields} filters={filters} onChange={setFilters} countFor={countFor} />
      </div>
      {visible.length === 0 ? (
        <p className="empty">No outcomes match.</p>
      ) : (
        <ul className="outcome-list">
          {visible.map((outcome) => {
            const linked = projectsForOutcome(projects, outcome);
            const outcomeTargets = targetsForOutcome(targets, outcome);
            return (
              <li key={outcome.id}>
                <div className="outcome">
                  <div>
                    <h3>{outcome.name}</h3>
                    {outcome.description && <p className="description">{outcome.description}</p>}
                    <p className="meta">
                      <TeamChips entries={teamsOnOutcome(outcomes, projects, outcome)} teams={teams} onOpen={onOpenTeam} />
                      <InsightBadge
                        count={insightsForOutcome(insights, outcome).length}
                        suggested={insightsForOutcome(suggestions, outcome).length}
                        dollars={totalDollarImpact(insightsForOutcome(insights, outcome))}
                        label={outcome.name}
                        onClick={(filter) => onShowInsights(outcome, 'outcome', filter)}
                      />
                      {linked.map((project) => (
                        <span className="tag project" key={project.id}>
                          {project.name}
                        </span>
                      ))}
                      {outcome.parent_outcome_id && nameOf(outcomes, outcome.parent_outcome_id) && (
                        <span className="tag parent">↳ {nameOf(outcomes, outcome.parent_outcome_id)}</span>
                      )}
                      <span className="id">#{outcome.id}</span>
                    </p>
                  </div>
                  <div className="actions">
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Edit ${outcome.name}`}
                      title="Edit"
                      onClick={() => onEdit(outcome)}
                    >
                      <PencilIcon />
                    </button>
                    <button
                      type="button"
                      className="icon-button danger"
                      aria-label={`Delete ${outcome.name}`}
                      title="Delete"
                      onClick={() => onDelete(outcome)}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </div>

                <div className="targets">
                  {outcomeTargets.length === 0 ? (
                    <p className="empty no-targets">
                      No target yet — nothing here says how far this has to move.
                    </p>
                  ) : (
                    <ul className="target-list">
                      {outcomeTargets.map((target) => (
                        <Target
                          key={target.id}
                          target={target}
                          onView={() => onViewTarget(target)}
                          onEdit={() => onEditTarget(target, outcome)}
                          onDelete={() => onDeleteTarget(target)}
                        />
                      ))}
                    </ul>
                  )}
                  <button
                    type="button"
                    className="ghost with-icon small"
                    onClick={() => onAddTarget(outcome)}
                  >
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

export function Target({ target, onView, onEdit, onDelete }) {
  const progress = progressOf(target);
  // The bar is clamped so an overshoot or a slide backwards still draws, while
  // the percentage beside it keeps reporting the real number.
  const width = progress == null ? 0 : Math.max(0, Math.min(1, progress)) * 100;

  return (
    <li className="target">
      <div className="target-head">
        <button
          type="button"
          className="target-open"
          title="Show measurements"
          aria-label={`Show measurements for ${targetLabel(target)}`}
          onClick={onView}
        >
          {target.name && <span className="target-name">{target.name}</span>}
          <span className="target-range">{targetRange(target)}</span>
        </button>
        <span className="target-actions">
          <button
            type="button"
            className="icon-button"
            aria-label={`Edit target ${targetLabel(target)}`}
            title="Edit target"
            onClick={onEdit}
          >
            <PencilIcon />
          </button>
          <button
            type="button"
            className="icon-button danger"
            aria-label={`Delete target ${targetLabel(target)}`}
            title="Delete target"
            onClick={onDelete}
          >
            <TrashIcon />
          </button>
        </span>
      </div>

      <div
        className="target-progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(width)}
        aria-label={`Progress on ${targetLabel(target)}`}
      >
        <div className="target-progress-fill" style={{ width: `${width}%` }} />
      </div>

      <p className="target-meta">
        {target.latest_value == null ? (
          <span className="muted">No readings yet</span>
        ) : (
          <>
            <span className="target-now">
              now {formatValue(target.latest_value)} {target.unit}
            </span>
            {progress != null && <span>{Math.round(progress * 100)}% of the way</span>}
            <span>
              {target.measurement_count} reading{target.measurement_count === 1 ? '' : 's'}
            </span>
          </>
        )}
        {target.due_at && <span>due {formatDate(target.due_at)}</span>}
      </p>
    </li>
  );
}

// Due dates are entered on a date input, which the form sends as UTC midnight.
// Reading them back in local time would show the day before for anyone west of
// UTC, so the calendar day is rendered in the zone it was stored in.
function formatDate(value) {
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
