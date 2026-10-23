import { useState } from 'react';
import { INSIGHT_TYPES, formatDollars, insightTypeLabel } from '../lib/links.js';
import { PencilIcon, PlusIcon, TrashIcon } from './icons.jsx';

// Every insight in the account, filterable by text and type. Each row shows how
// much work leans on it, since the point of an insight is to be reused.
export default function InsightList({ insights, onCreate, onEdit, onDelete }) {
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');

  const needle = query.trim().toLowerCase();
  const visible = insights.filter((insight) => {
    if (type && insight.type !== type) return false;
    if (!needle) return true;
    return `${insight.name} ${insight.source ?? ''} ${insight.description ?? ''}`
      .toLowerCase()
      .includes(needle);
  });

  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const filtered = needle || type;

  return (
    <>
      <div className="list-head">
        <input
          type="search"
          value={query}
          placeholder="Filter insights"
          aria-label="Filter insights"
          onChange={(event) => setQuery(event.target.value)}
        />
        <select value={type} aria-label="Filter by type" onChange={(event) => setType(event.target.value)}>
          <option value="">All types</option>
          {INSIGHT_TYPES.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
            </option>
          ))}
        </select>
        <span className="id">
          {filtered ? `${visible.length} of ${plural(insights.length, 'insight')}` : plural(insights.length, 'insight')}
        </span>
        <button type="button" className="with-icon" onClick={onCreate}>
          <PlusIcon />
          New insight
        </button>
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
                  <h3>{insight.name}</h3>
                  <p className="meta">
                    <span className="tag">{insightTypeLabel(insight.type)}</span>
                    <span className="tag">{plural(insight.outcome_ids.length, 'outcome')}</span>
                    <span className="tag project">{plural(insight.project_ids.length, 'project')}</span>
                    {insight.dollar_impact != null && (
                      <span className="tag">{formatDollars(insight.dollar_impact)}</span>
                    )}
                    {insight.observed_at && (
                      <span className="id">{new Date(insight.observed_at).toISOString().slice(0, 10)}</span>
                    )}
                    <span className="id">#{insight.id}</span>
                  </p>
                  {insight.source && <p className="hint">{insight.source}</p>}
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
