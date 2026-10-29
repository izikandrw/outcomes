import { useState } from 'react';
import { ArrowLeftIcon, ExpandIcon, PencilIcon } from './icons.jsx';
import LinkedText from './LinkedText.jsx';
import { IMPACT_AREAS, INSIGHT_TYPES, formatDollars, impactAreaLabel, insightTypeLabel } from '../lib/links.js';

// The insights behind one outcome or project, shown in a modal. Fields edit in
// place; the pencil goes to the full form, where links and details can be changed.
export default function EntityInsights({ entity, insights, onOpen, onUpdate, onAdd }) {
  const [error, setError] = useState(null);
  const [readingId, setReadingId] = useState(null);

  async function save(insight, patch) {
    setError(null);
    try {
      await onUpdate(insight, patch);
    } catch (err) {
      setError(`Could not save: ${err.message}`);
    }
  }

  const readingIndex = insights.findIndex((insight) => insight.id === readingId);
  if (readingIndex !== -1) {
    return (
      <InsightDetail
        insight={insights[readingIndex]}
        position={`${readingIndex + 1} of ${insights.length}`}
        onBack={() => setReadingId(null)}
        onPrev={readingIndex > 0 ? () => setReadingId(insights[readingIndex - 1].id) : null}
        onNext={readingIndex < insights.length - 1 ? () => setReadingId(insights[readingIndex + 1].id) : null}
        onEdit={() => onOpen(insights[readingIndex])}
      />
    );
  }

  return (
    <div className="entity-insights">
      {insights.length === 0 && <p className="empty">Nothing yet backs up “{entity.name}”.</p>}
      {insights.length > 0 && (
        <table className="insight-table">
          <thead>
            <tr>
              <th>Verified</th>
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
                  <VerifiedBadge status={insight.status} />
                </td>
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
                <td className="row-actions">
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Read insight ${insight.id}`}
                    title="Read full text"
                    onClick={() => setReadingId(insight.id)}
                  >
                    <ExpandIcon />
                  </button>
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

// Everything about one insight as plain readable text, with a way back to the
// list and to the neighbouring insights without leaving the modal.
function InsightDetail({ insight, position, onBack, onPrev, onNext, onEdit }) {
  const facts = [
    ['Type', insightTypeLabel(insight.type)],
    ['Area', insight.impact_area ? impactAreaLabel(insight.impact_area) : null],
    ['Impact', insight.dollar_impact != null ? formatDollars(insight.dollar_impact) : null],
    ['Observed', insight.observed_at ? new Date(insight.observed_at).toISOString().slice(0, 10) : null],
  ].filter(([, value]) => value);

  return (
    <div className="entity-insights insight-detail">
      <div className="detail-nav">
        <button type="button" className="ghost small" onClick={onBack}>
          <ArrowLeftIcon /> All insights
        </button>
        <span className="hint">{position}</span>
        <button type="button" className="ghost small" disabled={!onPrev} onClick={onPrev}>
          Previous
        </button>
        <button type="button" className="ghost small" disabled={!onNext} onClick={onNext}>
          Next
        </button>
      </div>
      <h3>
        {insight.name}
        {insight.status === 'unvalidated' && <span className="tag parent">Suggested</span>}
      </h3>
      <dl className="detail-facts">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <section>
        <h4>Details</h4>
        <p className="detail-text">{insight.description || <span className="hint">No details written.</span>}</p>
      </section>
      <section>
        <h4>Source</h4>
        <p className="detail-text">{insight.source ? <LinkedText text={insight.source} /> : <span className="hint">No source given.</span>}</p>
      </section>
      <div className="actions form-actions">
        <button type="button" onClick={onEdit}>
          Edit insight
        </button>
      </div>
    </div>
  );
}

// Whether a person has approved the insight. Collector suggestions stay
// unverified, and don't count as evidence, until someone reviews them.
function VerifiedBadge({ status }) {
  if (status === 'unvalidated') {
    return (
      <span className="tag parent" title="Suggested by the collector; waiting for a person to review it">
        Unverified
      </span>
    );
  }
  if (status === 'rejected') {
    return (
      <span className="tag parent warn" title="Rejected in review">
        Rejected
      </span>
    );
  }
  return (
    <span className="tag verified" title="Verified by a person">
      ✓ Human
    </span>
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
