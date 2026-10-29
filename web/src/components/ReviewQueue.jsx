import { useEffect, useState } from 'react';
import * as api from '../api.js';
import {
  REJECTION_REASONS,
  formatDollars,
  insightTypeLabel,
  rejectionReasonLabel,
} from '../lib/links.js';
import LinkedText from './LinkedText.jsx';
import CollectionRuns, { formatTime } from './CollectionRuns.jsx';

// Insights waiting for a person: mostly the insight collector's suggestions
// (product/agents/insight-collector/spec.md). Each card shows the excerpt it
// rests on and why it was linked where it was, so the reviewer can check both
// the observation and the links without leaving the page. Nothing here counts
// as evidence until it is approved. Besides links to existing outcomes and
// projects, the collector may propose ones that don't exist yet; the reviewer
// creates one (which links the insight to it but leaves it in review) or
// dismisses it, or approves the insight and creates all of them at once.
// Whatever was proposed, the reviewer can also create an outcome or project of
// their own and link the insight to it. The Runs tab shows the collector's
// traces.
export default function ReviewQueue({
  accountId,
  insights,
  outcomes,
  projects,
  onApprove,
  onReject,
  onEdit,
  onUnlink,
  onCreateProposed,
  onCreateOwn,
  onDismissProposed,
  onAcceptAll,
}) {
  const [tab, setTab] = useState('pending');
  const [lastRunAt, setLastRunAt] = useState(null);
  const pending = insights.filter((insight) => insight.status === 'unvalidated');
  const rejected = insights.filter((insight) => insight.status === 'rejected');
  const shown = tab === 'pending' ? pending : rejected;

  // The Runs tab names when the collector last ran; runs come newest first.
  useEffect(() => {
    api
      .listCollectionRuns(accountId)
      .then((runs) => setLastRunAt(runs[0]?.started_at ?? null))
      .catch(() => setLastRunAt(null));
  }, [accountId, insights]);

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
          <button type="button" aria-pressed={tab === 'runs'} onClick={() => setTab('runs')}>
            Runs{lastRunAt && ` (${formatTime(lastRunAt)})`}
          </button>
        </div>
      </div>
      {tab === 'runs' ? (
        <CollectionRuns accountId={accountId} />
      ) : shown.length === 0 ? (
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
              onCreateProposed={onCreateProposed}
              onCreateOwn={onCreateOwn}
              onDismissProposed={onDismissProposed}
              onAcceptAll={onAcceptAll}
            />
          ))}
        </ul>
      )}
    </>
  );
}

function ReviewCard({
  insight,
  outcomes,
  projects,
  onApprove,
  onReject,
  onEdit,
  onUnlink,
  onCreateProposed,
  onCreateOwn,
  onDismissProposed,
  onAcceptAll,
}) {
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
  const proposals = insight.proposed_links ?? [];
  const pending = insight.status === 'unvalidated';

  return (
    <li className="review-card">
      <h3>{insight.name}</h3>
      <p className="meta">
        <span className="tag-field" title="What kind of evidence this is">
          <span className="tag-key">Type</span>
          <span className="tag project">{insightTypeLabel(insight.type)}</span>
        </span>
        {insight.source_system && (
          <span className="tag-field" title="Where the collector found it; the link below opens the original">
            <span className="tag-key">Source</span>
            <span className="tag project">{insight.source_system}</span>
          </span>
        )}
        {insight.firsthand === true && (
          <span className="tag-field" title="The customer's own words or actions, including their words quoted verbatim by someone else">
            <span className="tag-key">Evidence</span>
            <span className="tag project">Firsthand</span>
          </span>
        )}
        {insight.firsthand === false && (
          <span className="tag-field" title="Someone else's paraphrase or summary of what the customer said">
            <span className="tag-key">Evidence</span>
            <span className="tag project">Relayed</span>
          </span>
        )}
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
        {links.length === 0 && proposals.length === 0 ? (
          <p className="hint">Nothing it fits yet. It may point to an outcome that's missing.</p>
        ) : links.length === 0 ? null : (
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
        {proposals.length > 0 && (
          <>
            <span className="hint">{links.length === 0 ? 'Nothing it fits yet. Suggested to create' : 'Also suggested to create'}</span>
            <ul className="proposed-links">
              {proposals.map((proposal, index) => {
                const noun = proposal.kind === 'project' ? 'project' : 'outcome';
                return (
                  <li key={`${proposal.kind}-${index}`} className="proposed-link">
                    <div className="proposed-head">
                      <span className={proposal.kind === 'project' ? 'tag project proposed' : 'tag proposed'}>
                        New {noun}
                      </span>
                      <span className="review-link-name">{proposal.name}</span>
                    </div>
                    {proposal.description && <p className="proposed-description">{proposal.description}</p>}
                    {proposal.rationale && <p className="hint">Why: {proposal.rationale}</p>}
                    {pending && (
                      <div className="proposed-actions">
                        <button
                          type="button"
                          className="ghost small"
                          title={`Opens the new ${noun} form, filled in; saving it links this insight to it. The insight stays in review.`}
                          disabled={busy}
                          onClick={() => onCreateProposed(insight, index)}
                        >
                          Create {noun} and link
                        </button>
                        <button
                          type="button"
                          className="link-button"
                          aria-label={`Dismiss suggested ${noun} ${proposal.name}`}
                          title={`Drop this suggested ${noun}; the insight is unaffected`}
                          disabled={busy}
                          onClick={() => run(() => onDismissProposed(insight, index))}
                        >
                          Dismiss
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
        {pending && (
          <div className="proposed-actions">
            {['outcome', 'project'].map((noun) => (
              <button
                key={noun}
                type="button"
                className="ghost small"
                title={`Opens a blank new ${noun} form; saving it links this insight to it. The insight stays in review.`}
                disabled={busy}
                onClick={() => onCreateOwn(insight, noun)}
              >
                New {noun} and link
              </button>
            ))}
          </div>
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
          <button
            type="button"
            className={pending && proposals.length > 0 ? 'ghost' : undefined}
            disabled={busy}
            onClick={() => run(() => onApprove(insight))}
          >
            {pending ? 'Approve' : 'Approve anyway'}
          </button>
          {pending && proposals.length > 0 && (
            <button
              type="button"
              title={`Approve, and create and link the ${proposals.length} suggested ${
                proposals.length === 1 ? proposals[0].kind : 'outcomes and projects'
              }`}
              disabled={busy}
              onClick={() => run(() => onAcceptAll(insight))}
            >
              Approve + create suggested
            </button>
          )}
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
