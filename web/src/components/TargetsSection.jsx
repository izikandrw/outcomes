import { targetLabel, targetRange } from '../lib/links.js';
import { PencilIcon, PlusIcon, TrashIcon } from './icons.jsx';

// The targets an outcome or impact owns, listed inside its own form. A target
// belongs to exactly one of them, so this is where they are added and edited.
// A parent that hasn't been saved yet has nothing to attach a target to.
export default function TargetsSection({ targets, saved, onAdd, onEdit, onDelete, onView }) {
  return (
    <section className="targets-section" aria-label="Targets">
      <div className="targets-section-head">
        <span>Targets</span>
        {saved && (
          <button type="button" className="ghost with-icon small" onClick={onAdd}>
            <PlusIcon />
            Add target
          </button>
        )}
      </div>
      {!saved ? (
        <p className="empty no-targets">Save first, then add targets.</p>
      ) : targets.length === 0 ? (
        <p className="empty no-targets">No target yet — nothing here says how far this has to move.</p>
      ) : (
        <ul className="target-list">
          {targets.map((target) => (
            <li key={target.id} className="target">
              <div className="target-head">
                <button
                  type="button"
                  className="target-open"
                  title="Show measurements"
                  aria-label={`Show measurements for ${targetLabel(target)}`}
                  onClick={() => onView(target)}
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
                    onClick={() => onEdit(target)}
                  >
                    <PencilIcon />
                  </button>
                  <button
                    type="button"
                    className="icon-button danger"
                    aria-label={`Delete target ${targetLabel(target)}`}
                    title="Delete target"
                    onClick={() => onDelete(target)}
                  >
                    <TrashIcon />
                  </button>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
