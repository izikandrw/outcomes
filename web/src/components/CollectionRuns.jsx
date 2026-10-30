import { useEffect, useState } from 'react';
import * as api from '../api.js';
import { rejectionReasonLabel } from '../lib/links.js';
import InsightHistory from './InsightHistory.jsx';

// The insight collector's run traces (product/agents/insight-collector/design.md,
// "Run traces"): every document it read, what it decided and why, and how its
// suggestions then fared in review. Used to spot its mistakes and to pick eval
// cases, which is why each document can be downloaded as an eval case's
// document.json (agent/evals/LABELING.md). Each suggestion opens its history:
// what the collector said, and what reviewers changed. Each document can be
// added to the eval set (EvalCases.jsx): to the review set, with the expected
// answer drafted from what reviewers did, or to the golden set, to label by
// hand. `openId` is the run whose trace shows, null for the list; onOpen(id or
// null) changes it; onOpenEvalSet() goes to the eval set.
export default function CollectionRuns({ accountId, outcomes, projects, openId, onOpen, onOpenEvalSet }) {
  const [runs, setRuns] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (openId) return;
    api
      .listCollectionRuns(accountId)
      .then(setRuns)
      .catch((err) => setError(err.message));
  }, [accountId, openId]);

  if (openId) {
    return (
      <RunTrace
        accountId={accountId}
        runId={openId}
        outcomes={outcomes}
        projects={projects}
        onBack={() => onOpen(null)}
        onOpenEvalSet={onOpenEvalSet}
      />
    );
  }
  if (error) return <p className="error">{error}</p>;
  if (!runs) return <p className="empty">Loading…</p>;
  if (runs.length === 0) return <p className="empty">No runs yet. Each run of the insight collector shows up here.</p>;

  return (
    <table className="insight-table runs-table">
      <thead>
        <tr>
          <th>Started</th>
          <th>Source</th>
          <th className="num">Documents</th>
          <th className="num">Suggested</th>
          <th>In review</th>
          <th>Run</th>
        </tr>
      </thead>
      <tbody>
        {runs.map((run) => (
          <tr key={run.id}>
            <td>
              <button type="button" className="link-button" onClick={() => onOpen(run.id)}>
                {formatTime(run.started_at)}
              </button>
            </td>
            <td>
              {run.source_config?.source_name || run.source_system}
              <span className="hint"> · {run.source_system}</span>
            </td>
            <td className="num">{run.document_count}</td>
            <td className="num">{run.review.suggested}</td>
            <td>
              <ReviewCounts review={run.review} />
            </td>
            <td>
              <span className={run.status === 'failed' ? 'tag warn' : 'tag project'}>{run.status}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ReviewCounts({ review }) {
  const parts = [
    [review.validated, 'approved'],
    [review.rejected, 'rejected'],
    [review.unvalidated, 'waiting'],
    [review.edited, 'edited'],
  ].filter(([n]) => n > 0);
  if (parts.length === 0) return <span className="hint">—</span>;
  return <span className="hint">{parts.map(([n, label]) => `${n} ${label}`).join(' · ')}</span>;
}

function RunTrace({ accountId, runId, outcomes, projects, onBack, onOpenEvalSet }) {
  const [run, setRun] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .getCollectionRun(accountId, runId)
      .then(setRun)
      .catch((err) => setError(err.message));
  }, [accountId, runId]);

  if (error) return <p className="error">{error}</p>;
  if (!run) return <p className="empty">Loading…</p>;

  const insightById = new Map(run.insights.map((insight) => [String(insight.id), insight]));
  const recorded = new Set(run.documents.flatMap((doc) => doc.insight_ids.map(String)));
  const unrecorded = run.insights.filter((insight) => !recorded.has(String(insight.id)));

  return (
    <div className="run-trace">
      <div className="list-head">
        <button type="button" className="ghost" onClick={onBack}>
          ← All runs
        </button>
        <span className="id">Run #{run.id}</span>
      </div>

      <dl className="run-facts">
        <dt>Source</dt>
        <dd>
          {run.source_config?.source_name || '—'} <span className="hint">({run.source_system})</span>
        </dd>
        <dt>One document is</dt>
        <dd>{run.source_config?.unit || '—'}</dd>
        <dt>Instructions</dt>
        <dd>
          {run.prompt_version || '—'}
          {run.model && <span className="hint"> · {run.model}</span>}
        </dd>
        <dt>Ran</dt>
        <dd>
          {formatTime(run.started_at)}
          {run.finished_at ? ` → ${formatTime(run.finished_at)}` : ' (still running)'} ·{' '}
          <span className={run.status === 'failed' ? 'tag warn' : 'tag project'}>{run.status}</span>
        </dd>
        <dt>Review</dt>
        <dd>
          <ReviewCounts review={run.review} />
        </dd>
      </dl>
      {run.error && <p className="error">{run.error}</p>}
      {run.summary && <p className="run-summary">{run.summary}</p>}

      <h3 className="run-heading">Documents ({run.documents.length})</h3>
      {run.documents.length === 0 && <p className="empty">The collector recorded no documents for this run.</p>}
      <ol className="review-list">
        {run.documents.map((doc) => (
          <li key={doc.id} className="review-card">
            <p className="meta">
              <span className="review-link-name">{doc.external_id}</span>
              <span className={doc.decision === 'suggested' ? 'tag' : 'tag project'}>{DECISION_LABELS[doc.decision]}</span>
            </p>
            {doc.reason && <p className="hint">{doc.reason}</p>}
            {doc.insight_ids.length > 0 && (
              <ul className="run-suggestions">
                {doc.insight_ids.map((id) => (
                  <Suggestion
                    key={id}
                    id={id}
                    insight={insightById.get(String(id))}
                    outcomes={outcomes}
                    projects={projects}
                  />
                ))}
              </ul>
            )}
            <details>
              <summary className="hint">Document text</summary>
              <pre className="run-text">{doc.text}</pre>
            </details>
            <div className="actions form-actions">
              <AddToEvalSet
                accountId={accountId}
                doc={doc}
                onAdded={(added) =>
                  setRun((current) => ({
                    ...current,
                    documents: current.documents.map((entry) =>
                      entry.id === doc.id ? { ...entry, eval_cases: [...(entry.eval_cases ?? []), added] } : entry,
                    ),
                  }))
                }
                onOpenEvalSet={onOpenEvalSet}
              />
              <button type="button" className="ghost small" onClick={() => downloadDocument(run, doc)}>
                Download document.json
              </button>
            </div>
          </li>
        ))}
      </ol>

      {unrecorded.length > 0 && (
        <>
          <h3 className="run-heading">Suggestions not tied to a recorded document</h3>
          <ul className="run-suggestions">
            {unrecorded.map((insight) => (
              <Suggestion key={insight.id} id={insight.id} insight={insight} outcomes={outcomes} projects={projects} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

const EVAL_SETS = [
  {
    id: 'review',
    label: 'Add to review set',
    hint: 'The expected answer is drafted from what reviewers did with these suggestions. Catches regressions.',
  },
  {
    id: 'golden',
    label: 'Add to golden set',
    hint: 'The expected answer starts blank: label it from the document alone, without looking at what the collector said.',
  },
];

// The document's eval set buttons: one per set it isn't in yet, and a link to
// the eval set for each it is.
function AddToEvalSet({ accountId, doc, onAdded, onOpenEvalSet }) {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  async function add(labelSource) {
    setBusy(labelSource);
    setError(null);
    try {
      const added = await api.createEvalCase(accountId, { run_document_id: doc.id, label_source: labelSource });
      onAdded({ id: added.id, label_source: added.label_source, status: added.status });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {EVAL_SETS.map((set) => {
        const existing = (doc.eval_cases ?? []).find((entry) => entry.label_source === set.id);
        if (existing) {
          return (
            <button key={set.id} type="button" className="ghost small" onClick={onOpenEvalSet} title="Open the eval set">
              In {set.id} set ({existing.status}) →
            </button>
          );
        }
        return (
          <button
            key={set.id}
            type="button"
            className="ghost small"
            title={set.hint}
            disabled={busy !== null}
            onClick={() => add(set.id)}
          >
            {busy === set.id ? 'Adding…' : set.label}
          </button>
        );
      })}
      {error && <span className="error">{error}</span>}
    </>
  );
}

const DECISION_LABELS = {
  suggested: 'Suggested',
  no_insight: 'No insight',
  already_collected: 'Already collected',
};

// One suggestion, what a reviewer made of it, and its history.
function Suggestion({ id, insight, outcomes, projects }) {
  if (!insight) return <li className="hint">#{id} (deleted)</li>;
  const verdict =
    insight.status === 'validated'
      ? { label: insight.edited_in_review ? 'Approved after edits' : 'Approved', className: 'tag' }
      : insight.status === 'rejected'
        ? { label: `Rejected: ${rejectionReasonLabel(insight.rejection_reason)}`, className: 'tag warn' }
        : { label: insight.edited_in_review ? 'Waiting (edited)' : 'Waiting for review', className: 'tag parent' };
  return (
    <li>
      <span className={verdict.className}>{verdict.label}</span> {insight.name} <span className="id">#{insight.id}</span>
      {insight.review_note && <span className="hint"> · “{insight.review_note}”</span>}
      <details className="insight-history-toggle">
        <summary className="hint">History ({insight.events?.length ?? 0})</summary>
        <InsightHistory events={insight.events} outcomes={outcomes} projects={projects} />
      </details>
    </li>
  );
}

// The document in the shape every eval case starts from (agent/evals/LABELING.md).
// expected.json is left to a person to write from scratch.
function downloadDocument(run, doc) {
  const document = {
    source_system: run.source_system,
    external_id: doc.external_id,
    url: null,
    title: doc.title,
    occurred_at: null,
    customer: null,
    firsthand: null,
    metadata: { collection_run_id: run.id },
    text: doc.text,
  };
  const blob = new Blob([`${JSON.stringify(document, null, 2)}\n`], { type: 'application/json' });
  const link = window.document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${doc.external_id.replace(/[^\w.-]+/g, '-')}.document.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export const formatTime = (value) =>
  new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
