import { useState } from 'react';
import {
  REJECTION_REASONS,
  formatDollars,
  insightTypeLabel,
  rejectionReasonLabel,
} from '../lib/links.js';
import LinkedText from './LinkedText.jsx';

// Insights waiting for a person: mostly the insight collector's suggestions
// (product/agents/insight-collector/spec.md). Each card shows the excerpt it
// rests on and why it was linked where it was, so the reviewer can check both
// the observation and the links without leaving the page. Nothing here counts
// as evidence until it is approved.
export default function ReviewQueue({ insights, outcomes, projects, onApprove, onReject, onEdit, onUnlink }) {
  const [tab, setTab] = useState('pending');
  const pending = insights.filter((insight) => insight.status === 'unvalidated');
  const rejected = insights.filter((insight) => insight.status === 'rejected');
  const shown = tab === 'pending' ? pending : rejected;

  return (
    <>
      <div className="list-head">
        <div className="view-toggle" role="group" aria-label="Review status">
          <button type="button" aria-pressed={tab === 'pending'} onClick={() => setTab('pending')}>
            Needs review ({pending.length})
          </button>
          <button type="button" aria-pressed={tab === 'rejected'} onClick={() => setTab('rejected')}>
            Rejected ({rejected.length})
          </button>
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="empty">
          {tab === 'pending'
            ? 'Nothing to review. Suggested insights from the insight collector show up here.'
            : 'No rejected suggestions.'}
        </p>
      ) : (
        <ul className="review-list">
          {[...shown].reverse().map((insight) => (
            <ReviewCard
              key={insight.id}
              insight={insight}
              outcomes={outcomes}
              projects={projects}
              onApprove={onApprove}
              onReject={onReject}
              onEdit={onEdit}
              onUnlink={onUnlink}
            />
          ))}
        </ul>
      )}
    </>
  );
}

function ReviewCard({ insight, outcomes, projects, onApprove, onReject, onEdit, onUnlink }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('not_an_insight');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function run(action) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const links = [
    ...insight.outcome_ids.map((id) => ({
      kind: 'outcome',
      id,
      name: outcomes.find((outcome) => String(outcome.id) === String(id))?.name ?? `Outcome #${id}`,
      rationale: insight.link_rationales?.outcomes?.[id],
    })),
    ...insight.project_ids.map((id) => ({
      kind: 'project',
      id,
      name: projects.find((project) => String(project.id) === String(id))?.name ?? `Project #${id}`,
      rationale: insight.link_rationales?.projects?.[id],
    })),
  ];
  const pending = insight.status === 'unvalidated';

  return (
    <li className="review-card">
      <h3>{insight.name}</h3>
      <p className="meta">
        <span className="tag">{insightTypeLabel(insight.type)}</span>
        {insight.source_system && <span className="tag project">{insight.source_system}</span>}
        {insight.firsthand === true && <span className="tag project">Firsthand</span>}
        {insight.firsthand === false && <span className="tag project">Relayed</span>}
        {insight.dollar_impact != null && <span className="tag">{formatDollars(insight.dollar_impact)}</span>}
        {insight.edited_in_review && <span className="tag parent">Edited</span>}
        {insight.observed_at && (
          <span className="id">{new Date(insight.observed_at).toISOString().slice(0, 10)}</span>
        )}
        <span className="id">#{insight.id}</span>
      </p>
      {insight.description && <p className="description">{insight.description}</p>}

      {insight.source_excerpt && <blockquote className="excerpt">“{insight.source_excerpt}”</blockquote>}
      <SourceLine insight={insight} />

      <div className="review-links">
        <span className="hint">Supports</span>
        {links.length === 0 ? (
          <p className="hint">Nothing it fits yet. It may point to an outcome that's missing.</p>
        ) : (
          <ul>
            {links.map((link) => (
              <li key={`${link.kind}-${link.id}`}>
                <span className={link.kind === 'project' ? 'tag project' : 'tag'}>
                  {link.kind === 'project' ? 'Project' : 'Outcome'}
                </span>
                <span className="review-link-name">{link.name}</span>
                {link.rationale && <span className="hint">{link.rationale}</span>}
                {pending && (
                  <button
                    type="button"
                    className="link-button"
                    aria-label={`Remove link to ${link.name}`}
                    title="Remove this link"
                    disabled={busy}
                    onClick={() => run(() => onUnlink(insight, link.kind, link.id))}
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {insight.status === 'rejected' && (
        <p className="hint">
          Rejected: {rejectionReasonLabel(insight.rejection_reason)}
          {insight.review_note ? `. ${insight.review_note}` : ''}
        </p>
      )}

      {error && <p className="error">{error}</p>}

      {rejecting ? (
        <div className="reject-form">
          <select value={reason} aria-label="Reason" onChange={(event) => setReason(event.target.value)}>
            {REJECTION_REASONS.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
          <input
            value={note}
            placeholder="Note (optional): what was wrong?"
            aria-label="Note"
            onChange={(event) => setNote(event.target.value)}
          />
          <div className="actions">
            <button type="button" className="ghost" disabled={busy} onClick={() => setRejecting(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="danger-solid"
              disabled={busy}
              onClick={() => run(() => onReject(insight, reason, note.trim() || null))}
            >
              Reject
            </button>
          </div>
        </div>
      ) : (
        <div className="actions form-actions">
          {pending && (
            <>
              <button type="button" className="ghost" disabled={busy} onClick={() => setRejecting(true)}>
                Reject…
              </button>
              <button type="button" className="ghost" disabled={busy} onClick={() => onEdit(insight)}>
                Edit
              </button>
            </>
          )}
          <button type="button" disabled={busy} onClick={() => run(() => onApprove(insight))}>
            {pending ? 'Approve' : 'Approve anyway'}
          </button>
        </div>
      )}
    </li>
  );
}

// Where to go to check the observation: the link into the external tool when
// there is one, otherwise whatever reference was recorded.
function SourceLine({ insight }) {
  if (insight.source_url) {
    return (
      <p className="hint">
        <a href={insight.source_url} target="_blank" rel="noreferrer">
          {insight.source_external_id || 'Open source'}
        </a>
      </p>
    );
  }
  const reference = insight.source_external_id || insight.source;
  return reference ? (
    <p className="hint">
      <LinkedText text={reference} />
    </p>
  ) : null;
}
