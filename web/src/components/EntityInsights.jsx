import { useState } from 'react';
import { PencilIcon } from './icons.jsx';
import { IMPACT_AREAS, INSIGHT_TYPES, formatDollars } from '../lib/links.js';

// The insights behind one outcome or project, shown in a modal. Fields edit in
// place; the pencil goes to the full form, where links and details can be changed.
export default function EntityInsights({ entity, insights, onOpen, onUpdate, onAdd }) {
  const [error, setError] = useState(null);

  async function save(insight, patch) {
    setError(null);
    try {
      await onUpdate(insight, patch);
    } catch (err) {
      setError(`Could not save: ${err.message}`);
    }
  }

  return (
    <div className="entity-insights">
      {insights.length === 0 && <p className="empty">Nothing yet backs up “{entity.name}”.</p>}
      {insights.length > 0 && (
        <table className="insight-table">
          <thead>
            <tr>
              <th>Insight</th>
              <th>Type</th>
              <th>Area</th>
              <th className="num">Impact</th>
              <th>Observed</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {insights.map((insight) => (
              <tr key={insight.id}>
                <td>
                  <TextCell
                    value={insight.name}
                    label="Insight name"
                    required
                    bold
                    onCommit={(name) => save(insight, { name })}
                  />
                </td>
                <td>
                  <select
                    className="cell-input"
                    aria-label="Type"
                    value={insight.type}
                    onChange={(event) => save(insight, { type: event.target.value })}
                  >
                    {INSIGHT_TYPES.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    className="cell-input"
                    aria-label="Area"
                    value={insight.impact_area ?? ''}
                    onChange={(event) => save(insight, { impact_area: event.target.value || null })}
                  >
                    <option value="">—</option>
                    {IMPACT_AREAS.map((area) => (
                      <option key={area.id} value={area.id}>
                        {area.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="num">
                  <TextCell
                    value={insight.dollar_impact ?? ''}
                    label="Dollar impact"
                    type="number"
                    step="0.01"
                    num
                    display={insight.dollar_impact != null ? formatDollars(insight.dollar_impact) : '—'}
                    onCommit={(value) => save(insight, { dollar_impact: value === '' ? null : Number(value) })}
                  />
                </td>
                <td>
                  <input
                    className="cell-input"
                    type="date"
                    aria-label="Observed"
                    value={insight.observed_at ? new Date(insight.observed_at).toISOString().slice(0, 10) : ''}
                    onChange={(event) =>
                      save(insight, {
                        observed_at: event.target.value ? new Date(event.target.value).toISOString() : null,
                      })
                    }
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Edit insight ${insight.id}`}
                    title="Edit all details"
                    onClick={() => onOpen(insight)}
                  >
                    <PencilIcon />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {error && <p className="error">{error}</p>}
      <div className="actions form-actions">
        <button type="button" onClick={onAdd}>
          Add insight
        </button>
      </div>
    </div>
  );
}

// Text/number input that saves on blur or Enter, and only when the value
// changed. Escape puts back what was there.
// `display`, when given, is what shows while the cell isn't focused.
function TextCell({ value, label, type = 'text', step, required, bold, num, display, onCommit }) {
  const [draft, setDraft] = useState(null);
  const [focused, setFocused] = useState(false);
  const shown = draft ?? String(value);

  function commit() {
    if (draft === null) return;
    const next = draft.trim();
    setDraft(null);
    if (next === String(value) || (required && !next)) return;
    onCommit(next);
  }

  return (
    <input
      className={`cell-input${bold ? ' bold' : ''}${num ? ' num' : ''}`}
      type={display && !focused ? 'text' : type}
      step={step}
      aria-label={label}
      value={display && !focused && draft === null ? display : shown}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        commit();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') {
          setDraft(null);
          event.currentTarget.blur();
        }
      }}
    />
  );
}
