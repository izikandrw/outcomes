import { formatDollars, insightTypeLabel } from '../lib/links.js';

// The insights behind one outcome or project, shown in a modal. Picking one
// opens it for editing, where its other links can be seen and changed.
export default function EntityInsights({ entity, insights, onOpen, onAdd }) {
  return (
    <div className="entity-insights">
      {insights.length === 0 && <p className="empty">Nothing yet backs up “{entity.name}”.</p>}
      {insights.length > 0 && (
        <ul className="outcome-list">
          {insights.map((insight) => (
            <li key={insight.id}>
              <div className="outcome">
                <div>
                  <button type="button" className="link-button" onClick={() => onOpen(insight)}>
                    {insight.name}
                  </button>
                  <p className="meta">
                    <span className="tag">{insightTypeLabel(insight.type)}</span>
                    {insight.dollar_impact != null && (
                      <span className="tag">{formatDollars(insight.dollar_impact)}</span>
                    )}
                    {insight.observed_at && (
                      <span className="id">{new Date(insight.observed_at).toISOString().slice(0, 10)}</span>
                    )}
                  </p>
                  {insight.source && <p className="hint">{insight.source}</p>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="actions form-actions">
        <button type="button" onClick={onAdd}>
          Add insight
        </button>
      </div>
    </div>
  );
}
