import { useState } from 'react';
import { ArrowLeftIcon, ExpandIcon, PencilIcon } from './icons.jsx';
import LinkedText from './LinkedText.jsx';
import {
  IMPACT_AREAS,
  INSIGHT_TYPES,
  REJECTION_REASONS,
  SENTIMENTS,
  formatDollars,
  impactAreaLabel,
  insightTypeLabel,
  isEvidence,
  sentimentOf,
} from '../lib/links.js';

// Columns the table can be sorted by, and the value each sorts on. A missing
// value (null) always sorts last, whichever way the column is ordered.
const SORT_KEYS = {
  status: (insight) => (insight.status === 'validated' ? 0 : insight.status === 'unvalidated' ? 1 : 2),
  name: (insight) => insight.name.toLowerCase(),
  type: (insight) => insightTypeLabel(insight.type).toLowerCase(),
  // Negative first ascending: the problems are what the evidence is usually for.
  sentiment: (insight) => (insight.sentiment ? ['negative', 'neutral', 'positive'].indexOf(insight.sentiment) : null),
  area: (insight) => (insight.impact_area ? impactAreaLabel(insight.impact_area).toLowerCase() : null),
  impact: (insight) => (insight.dollar_impact != null ? Number(insight.dollar_impact) : null),
  source: (insight) => sourceOf(insight)?.label.toLowerCase() ?? null,
  observed: (insight) => (insight.observed_at ? new Date(insight.observed_at).getTime() : null),
};

// Which insights the list shows. It opens on the kind whose badge was clicked;
// All shows both, with that kind still first until a column is sorted.
const FILTERS = [
  { id: 'verified', label: 'Verified', matches: (insight) => isEvidence(insight) },
  { id: 'suggested', label: 'Suggested', matches: (insight) => !isEvidence(insight) },
  { id: 'all', label: 'All', matches: () => true },
];

function sortInsights(insights, sort, first) {
  if (!sort) {
    const matches = FILTERS.find((filter) => filter.id === first)?.matches;
    return matches ? [...insights].sort((a, b) => matches(b) - matches(a)) : insights;
  }
  const key = SORT_KEYS[sort.column];
  const direction = sort.descending ? -1 : 1;
  return [...insights].sort((a, b) => {
    const x = key(a);
    const y = key(b);
    if (x === y) return a.id - b.id;
    if (x === null) return 1;
    if (y === null) return -1;
    return (x < y ? -1 : 1) * direction;
  });
}

// The insights behind one outcome or project, shown in a modal. Fields edit in
// place; the pencil goes to the full form, where links and details can be changed.
// Clicking a column heading sorts by it; clicking again reverses the order.
export default function EntityInsights({
  entity,
  insights: all,
  initialFilter = 'verified',
  onOpen,
  onUpdate,
  onValidate,
  onReject,
  onReopen,
  onAdd,
}) {
  const [error, setError] = useState(null);
  const [readingId, setReadingId] = useState(null);
  const [sort, setSort] = useState(null);
  const [filter, setFilter] = useState(initialFilter);
  const shown = all.filter(FILTERS.find((entry) => entry.id === filter).matches);
  const insights = sortInsights(shown, sort, initialFilter);

  function sortBy(column) {
    setSort((current) => ({
      column,
      descending: current?.column === column ? !current.descending : false,
    }));
  }

  const heading = (column, label, className) => (
    <SortHeading column={column} label={label} className={className} sort={sort} onSort={sortBy} />
  );

  async function save(insight, patch) {
    setError(null);
    try {
      await onUpdate(insight, patch);
    } catch (err) {
      setError(`Could not save: ${err.message}`);
    }
  }

  // value is 'unvalidated', 'validated' or 'reject:<reason>', from the Verified column.
  async function review(insight, value) {
    setError(null);
    try {
      if (value === 'unvalidated') await onReopen(insight);
      else if (value === 'validated') await onValidate(insight);
      else await onReject(insight, value.slice('reject:'.length));
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
      <div className="view-toggle" role="group" aria-label="Show insights">
        {FILTERS.map(({ id, label, matches }) => (
          <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)}>
            {label} · {all.filter(matches).length}
          </button>
        ))}
      </div>
      {all.length === 0 && <p className="empty">Nothing yet backs up “{entity.name}”.</p>}
      {all.length > 0 && insights.length === 0 && (
        <p className="empty">
          {filter === 'verified' ? 'No verified insights yet.' : 'No suggestions waiting for review.'}
        </p>
      )}
      {insights.length > 0 && (
        <div className="insight-table-scroll">
          <table className="insight-table">
            <thead>
              <tr>
                {heading('status', 'Verified')}
                {heading('sentiment', 'Mood')}
                {heading('name', 'Insight')}
                {heading('type', 'Type')}
                {heading('area', 'Area')}
                {heading('impact', 'Impact', 'num')}
                {heading('source', 'Source')}
                {heading('observed', 'Observed')}
                <th />
              </tr>
            </thead>
            <tbody>
              {insights.map((insight) => (
                <tr key={insight.id}>
                  <td>
                    <VerifiedSelect
                      status={insight.status}
                      onChange={(value) => review(insight, value)}
                    />
                  </td>
                  <td>
                    <select
                      className="cell-input sentiment-select"
                      aria-label="Sentiment"
                      title={sentimentOf(insight.sentiment)?.label ?? 'No sentiment'}
                      value={insight.sentiment ?? ''}
                      onChange={(event) => save(insight, { sentiment: event.target.value || null })}
                    >
                      <option value="">—</option>
                      {SENTIMENTS.map((sentiment) => (
                        <option key={sentiment.id} value={sentiment.id}>
                          {sentiment.emoji} {sentiment.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <TextCell
                      value={insight.name}
                      label="Insight name"
                      required
                      bold
                      multiline
                      onCommit={(name) => save(insight, { name })}
                    />
                    {insight.source_excerpt && (
                      <blockquote className="excerpt clamp" title={insight.source_excerpt}>
                        “{insight.source_excerpt}”
                      </blockquote>
                    )}
                  </td>
                  <td>
                    <select
                      className="cell-input pill"
                      data-value={insight.type}
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
                      className={insight.impact_area ? 'cell-input pill' : 'cell-input pill empty'}
                      data-value={insight.impact_area ?? ''}
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
                    <SourceCell insight={insight} />
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
                    <div className="row-actions">
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
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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

// A column heading that sorts the table, with an arrow showing the current order.
function SortHeading({ column, label, className, sort, onSort }) {
  const active = sort?.column === column;
  const ariaSort = active ? (sort.descending ? 'descending' : 'ascending') : 'none';
  return (
    <th className={className} aria-sort={ariaSort}>
      <button type="button" className={`sort-heading${active ? ' active' : ''}`} onClick={() => onSort(column)}>
        {label}
        <span className="sort-arrow" aria-hidden="true">
          {active ? (sort.descending ? '↓' : '↑') : '↕'}
        </span>
      </button>
    </th>
  );
}

// Where an insight came from, short enough for a table cell: a link labelled
// with the site's domain when the source is a URL, otherwise the reference text.
function sourceOf(insight) {
  const url = insight.source_url || (/^https?:\/\/\S+$/.test(insight.source?.trim() ?? '') ? insight.source.trim() : null);
  if (url) {
    try {
      return { label: new URL(url).hostname.replace(/^www\./, ''), href: url };
    } catch {
      return { label: url, href: url };
    }
  }
  const text = insight.source_external_id || insight.source;
  return text ? { label: text, href: null } : null;
}

// The Source column: one line, truncated, with the whole source on hover.
// Edit it from the full form.
function SourceCell({ insight }) {
  const source = sourceOf(insight);
  if (!source) return <span className="hint">—</span>;
  const full = insight.source || source.href;
  return source.href ? (
    <a className="source-cell" href={source.href} target="_blank" rel="noreferrer" title={full}>
      {source.label}
    </a>
  ) : (
    <span className="source-cell" title={full}>
      {source.label}
    </span>
  );
}

// Everything about one insight as plain readable text, with a way back to the
// list and to the neighbouring insights without leaving the modal.
function InsightDetail({ insight, position, onBack, onPrev, onNext, onEdit }) {
  const facts = [
    ['Type', insightTypeLabel(insight.type)],
    ['Sentiment', sentimentOf(insight.sentiment) && `${sentimentOf(insight.sentiment).emoji} ${sentimentOf(insight.sentiment).label}`],
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
      {insight.source_excerpt && (
        <section>
          <h4>Quote</h4>
          <blockquote className="excerpt">“{insight.source_excerpt}”</blockquote>
        </section>
      )}
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

// Whether a person has approved the insight, and the control to change it.
// Collector suggestions stay unverified, and don't count as evidence, until
// someone verifies them; rejecting needs a reason, which feeds the collector's
// evals. Choosing Unverified undoes a review and puts it back in the queue.
function VerifiedSelect({ status, onChange }) {
  const verified = status === 'validated';
  return (
    <select
      className={`tag verify-select ${verified ? 'verified' : 'parent'}`}
      aria-label="Verified"
      title={verified ? 'Verified by a person' : 'Suggested by the collector; waiting for a person to review it'}
      value={status}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="unvalidated">Unverified</option>
      <option value="validated">✓ Human</option>
      <optgroup label="Reject as…">
        {REJECTION_REASONS.map((reason) => (
          <option key={reason.id} value={`reject:${reason.id}`}>
            {reason.label}
          </option>
        ))}
      </optgroup>
    </select>
  );
}

// Text/number input that saves on blur or Enter, and only when the value
// changed. Escape puts back what was there.
// `display`, when given, is what shows while the cell isn't focused.
// `multiline` wraps the text to two lines (then truncates) until focused, when
// it becomes a textarea that grows to fit the whole value. Hovering truncated
// text shows all of it over the cell, so reading it doesn't mean editing it.
function TextCell({ value, label, type = 'text', step, required, bold, num, multiline, display, onCommit }) {
  const [draft, setDraft] = useState(null);
  const [focused, setFocused] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const shown = draft ?? String(value);

  function commit() {
    if (draft === null) return;
    const next = draft.trim();
    setDraft(null);
    if (next === String(value) || (required && !next)) return;
    onCommit(next);
  }

  const className = `cell-input${bold ? ' bold' : ''}${num ? ' num' : ''}`;

  if (multiline && !focused) {
    return (
      <div className="clamp-wrap">
        <div
          className={`${className} clamp`}
          role="textbox"
          tabIndex={0}
          aria-label={label}
          onMouseEnter={(event) => setTruncated(event.currentTarget.scrollHeight > event.currentTarget.clientHeight)}
          onFocus={() => setFocused(true)}
        >
          {shown}
        </div>
        {truncated && (
          <div className={`${className} clamp-full`} aria-hidden="true">
            {shown}
          </div>
        )}
      </div>
    );
  }

  if (multiline) {
    return (
      <textarea
        className={className}
        rows={1}
        autoFocus
        aria-label={label}
        value={shown}
        ref={fitHeight}
        onChange={(event) => {
          setDraft(event.target.value);
          fitHeight(event.target);
        }}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            event.currentTarget.blur();
          }
          if (event.key === 'Escape') {
            setDraft(null);
            event.currentTarget.blur();
          }
        }}
      />
    );
  }

  return (
    <input
      className={className}
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

function fitHeight(textarea) {
  if (!textarea) return;
  textarea.style.height = 'auto';
  textarea.style.height = `${textarea.scrollHeight + 2}px`;
}
