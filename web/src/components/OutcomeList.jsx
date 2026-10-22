import {
  formatValue,
  insightsForOutcome,
  progressOf,
  projectsForOutcome,
  targetsForOutcome,
} from '../lib/links.js';
import InsightBadge from './InsightBadge.jsx';
import { PencilIcon, PlusIcon, TrashIcon } from './icons.jsx';

// Flat list of every outcome. Nesting is shown by the tree view instead, so a
// child names its parent here rather than being indented under it. Targets are
// listed under their outcome, because a behavior change with no numbers on it
// is the thing this view most needs to make obvious.
export default function OutcomeList({
  outcomes,
  teams,
  projects,
  targets,
  insights,
  onEdit,
  onDelete,
  onShowInsights,
  onAddTarget,
  onEditTarget,
  onDeleteTarget,
}) {
  const nameOf = (collection, id) => collection.find((item) => item.id === id)?.name ?? null;

  return (
    <ul className="outcome-list">
      {outcomes.map((outcome) => {
        const linked = projectsForOutcome(projects, outcome);
        const outcomeTargets = targetsForOutcome(targets, outcome);
        return (
          <li key={outcome.id}>
            <div className="outcome">
              <div>
                <h3>{outcome.name}</h3>
                {outcome.description && <p className="description">{outcome.description}</p>}
                <p className="meta">
                  <span className="tag">
                    {nameOf(teams, outcome.team_id) ?? `team ${outcome.team_id}`}
                  </span>
                  <InsightBadge
                    count={insightsForOutcome(insights, outcome).length}
                    label={outcome.name}
                    onClick={() => onShowInsights(outcome, 'outcome')}
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
  );
}

function Target({ target, onEdit, onDelete }) {
  const progress = progressOf(target);
  // The bar is clamped so an overshoot or a slide backwards still draws, while
  // the percentage beside it keeps reporting the real number.
  const width = progress == null ? 0 : Math.max(0, Math.min(1, progress)) * 100;

  return (
    <li className="target">
      <div className="target-head">
        <span className="target-name">{target.name}</span>
        <span className="target-range">
          {formatValue(target.baseline_value)} → {formatValue(target.target_value)} {target.unit}
        </span>
        <span className="target-actions">
          <button
            type="button"
            className="icon-button"
            aria-label={`Edit target ${target.name}`}
            title="Edit target"
            onClick={onEdit}
          >
            <PencilIcon />
          </button>
          <button
            type="button"
            className="icon-button danger"
            aria-label={`Delete target ${target.name}`}
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
        aria-label={`Progress on ${target.name}`}
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
