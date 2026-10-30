import { outcomesForImpact, targetsForImpact } from '../lib/links.js';
import { Target } from './OutcomeList.jsx';
import { PencilIcon, PlusIcon, TrashIcon } from './icons.jsx';

// Flat list of every impact, laid out like the outcome list. A child names its
// parent impact rather than being indented under it, and the outcomes driving
// each impact are tagged so one with nothing rolling up to it stands out.
export default function ImpactList({
  impacts,
  outcomes,
  targets,
  onEdit,
  onDelete,
  onAddTarget,
  onEditTarget,
  onDeleteTarget,
  onViewTarget,
}) {
  const nameOf = (id) => impacts.find((item) => String(item.id) === String(id))?.name ?? null;

  return (
    <ul className="outcome-list">
      {impacts.map((impact) => {
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
                    />
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
  );
}
