import { useEffect, useRef, useState } from 'react';
import * as api from '../api.js';
import Modal from './Modal.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';
import { formatTime } from './CollectionRuns.jsx';

// The insight collector's eval set (product/agents/insight-collector/evals.md):
// documents with the answer it should give, added from a run trace. A review
// case's answer was drafted from what reviewers did; a golden case's is labelled
// here by hand, from the document alone (agent/evals/LABELING.md). Only ready
// cases are scored, and the test split is held out while tuning.
export default function EvalCases({ accountId }) {
  const [cases, setCases] = useState(null);
  const [error, setError] = useState(null);
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    api
      .listEvalCases(accountId)
      .then(setCases)
      .catch((err) => setError(err.message));
  }, [accountId]);

  if (error) return <p className="error">{error}</p>;
  if (!cases) return <p className="empty">Loading…</p>;
  if (cases.length === 0) {
    return (
      <p className="empty">
        No eval cases yet. Open a run on the Runs tab and add documents to the review set or the golden set.
      </p>
    );
  }

  const ready = cases.filter((entry) => entry.status === 'ready');
  const open = cases.find((entry) => entry.id === openId);
  const replace = (saved) => setCases((current) => current.map((entry) => (entry.id === saved.id ? saved : entry)));

  return (
    <>
      <div className="list-head">
        <span className="hint">
          {cases.length} cases · {ready.length} ready ({ready.filter((entry) => entry.split === 'dev').length} dev,{' '}
          {ready.filter((entry) => entry.split === 'test').length} test) · {cases.length - ready.length} drafts
        </span>
        <button type="button" className="ghost small" disabled={ready.length === 0} onClick={() => downloadSet(ready)}>
          Download ready cases
        </button>
      </div>
      <table className="insight-table runs-table">
        <thead>
          <tr>
            <th>Case</th>
            <th>Set</th>
            <th>Split</th>
            <th>Status</th>
            <th className="num">Expected</th>
            <th>Added</th>
          </tr>
        </thead>
        <tbody>
          {cases.map((entry) => (
            <tr key={entry.id}>
              <td>
                <button type="button" className="link-button" onClick={() => setOpenId(entry.id)}>
                  {entry.name}
                </button>
                {entry.problems.length > 0 && <span className="hint"> · {entry.problems.length} to fix</span>}
              </td>
              <td>{entry.label_source}</td>
              <td>{entry.split}</td>
              <td>
                <span className={entry.status === 'ready' ? 'tag' : 'tag parent'}>{entry.status}</span>
              </td>
              <td className="num">
                {entry.expected.insights?.length ?? 0}
                {(entry.expected.not_insights?.length ?? 0) > 0 && (
                  <span className="hint"> · {entry.expected.not_insights.length} not</span>
                )}
              </td>
              <td className="hint">{formatTime(entry.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {open && (
        <CaseEditor
          accountId={accountId}
          evalCase={open}
          onSaved={(saved) => {
            replace(saved);
            setOpenId(null);
          }}
          onDeleted={() => {
            setCases((current) => current.filter((entry) => entry.id !== open.id));
            setOpenId(null);
          }}
          onClose={() => setOpenId(null)}
        />
      )}
    </>
  );
}

// A new expected insight, in the shape agent/evals/LABELING.md describes.
const blankInsight = (excerpt) => ({
  excerpt,
  name: '',
  type: 'other',
  sentiment: null,
  firsthand: null,
  dollar_impact: null,
  links: [],
});

const LABELING_TIPS = [
  'Label from the document alone: an insight is one specific observation someone could go back and check.',
  'A conclusion, our own rep’s opinion or a vague ask is not an insight. Most documents have none.',
  'Select the exact words an insight rests on and use them as its excerpt.',
];

// Postgres hands JSON back with its keys reordered; put them back in reading
// order (insights first, each insight's excerpt and name first).
const INSIGHT_KEYS = ['excerpt', 'name', 'type', 'sentiment', 'firsthand', 'dollar_impact', 'links', 'proposed', 'reason', 'note'];
const byKeyOrder = (keys) => (entry) =>
  Object.fromEntries(
    Object.entries(entry ?? {}).sort(
      ([a], [b]) => (keys.indexOf(a) + 1 || keys.length + 1) - (keys.indexOf(b) + 1 || keys.length + 1),
    ),
  );

function readableAnswer({ insights = [], not_insights = [], tags = [], ...other }) {
  const tidy = byKeyOrder(INSIGHT_KEYS);
  return { insights: insights.map(tidy), not_insights: not_insights.map(tidy), tags, ...other };
}

// Exported so it can be rendered on its own.
export function CaseEditor({ accountId, evalCase, onSaved, onDeleted, onClose }) {
  const { notes = '', ...rest } = readableAnswer(evalCase.expected);
  const [name, setName] = useState(evalCase.name);
  const [split, setSplit] = useState(evalCase.split);
  const [status, setStatus] = useState(evalCase.status);
  const [details, setDetails] = useState({
    customer: evalCase.document.customer ?? '',
    occurred_at: evalCase.document.occurred_at ?? '',
    firsthand: evalCase.document.firsthand,
  });
  const [labelNotes, setLabelNotes] = useState(notes);
  const [answer, setAnswer] = useState(JSON.stringify(rest, null, 2));
  const [selection, setSelection] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const textRef = useRef(null);

  // Text selected inside the document can become an expected insight's excerpt.
  function noteSelection() {
    const selected = window.getSelection();
    const inside = selected && textRef.current?.contains(selected.anchorNode);
    setSelection(inside ? selected.toString().trim() : '');
  }

  function addSelectionAsInsight() {
    try {
      const parsed = JSON.parse(answer);
      parsed.insights = [...(parsed.insights ?? []), blankInsight(selection)];
      setAnswer(JSON.stringify(parsed, null, 2));
      setSelection('');
      setError(null);
    } catch {
      setError('Fix the expected answer’s JSON before adding to it.');
    }
  }

  async function save(event) {
    event.preventDefault();
    let parsed;
    try {
      parsed = JSON.parse(answer);
    } catch {
      setError('The expected answer isn’t valid JSON.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await api.updateEvalCase(accountId, evalCase.id, {
        name,
        split,
        status,
        document: {
          ...evalCase.document,
          customer: details.customer || null,
          occurred_at: details.occurred_at || null,
          firsthand: details.firsthand,
        },
        expected: { ...parsed, notes: labelNotes },
      });
      onSaved(saved);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    try {
      await api.deleteEvalCase(accountId, evalCase.id);
      onDeleted();
    } catch (err) {
      setConfirmDelete(false);
      setError(err.message);
    }
  }

  return (
    <Modal title={`Eval case: ${evalCase.name}`} wide onClose={onClose}>
      <form className="outcome-form eval-case-form" onSubmit={save}>
        {evalCase.label_source === 'golden' ? (
          <ul className="hint eval-case-tips">
            {LABELING_TIPS.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        ) : (
          <p className="hint">
            Drafted from review: approved suggestions are expected as reviewers left them, and suggestions rejected
            as not an insight are listed under not_insights. Check the notes, then mark it ready.
          </p>
        )}

        <label>
          Name
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <div className="eval-case-row">
          <label>
            Split
            <select value={split} onChange={(event) => setSplit(event.target.value)}>
              <option value="dev">dev: look at failures freely</option>
              <option value="test">test: held out while tuning</option>
            </select>
          </label>
          <label>
            Status
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="draft">draft</option>
              <option value="ready">ready to score</option>
            </select>
          </label>
        </div>

        <div className="eval-case-row">
          <label>
            Customer
            <input value={details.customer} onChange={(event) => setDetails({ ...details, customer: event.target.value })} />
          </label>
          <label>
            Occurred
            <input
              value={details.occurred_at}
              placeholder="YYYY-MM-DD"
              onChange={(event) => setDetails({ ...details, occurred_at: event.target.value })}
            />
          </label>
          <label>
            Evidence
            <select
              value={details.firsthand === true ? 'true' : details.firsthand === false ? 'false' : ''}
              onChange={(event) =>
                setDetails({ ...details, firsthand: event.target.value === '' ? null : event.target.value === 'true' })
              }
            >
              <option value="">not set</option>
              <option value="true">firsthand</option>
              <option value="false">relayed</option>
            </select>
          </label>
        </div>

        <div className="eval-case-document">
          <span className="eval-case-label">
            Document <span className="hint">· {evalCase.document.external_id}</span>
          </span>
          <pre ref={textRef} className="run-text" onMouseUp={noteSelection} onKeyUp={noteSelection}>
            {evalCase.document.text}
          </pre>
          {selection && (
            <button type="button" className="ghost small" onClick={addSelectionAsInsight}>
              Use selection as a new expected insight’s excerpt
            </button>
          )}
        </div>

        <label>
          Expected answer
          <textarea className="eval-case-json" rows={14} spellCheck={false} value={answer} onChange={(event) => setAnswer(event.target.value)} />
          <span className="hint">
            insights: what the collector should find (excerpt, name, type, sentiment, firsthand, dollar_impact, links).
            not_insights: what it should leave alone.
          </span>
        </label>

        <label>
          Notes
          <textarea rows={3} value={labelNotes} onChange={(event) => setLabelNotes(event.target.value)} />
          <span className="hint">Close calls and why, as in LABELING.md.</span>
        </label>

        {evalCase.problems.length > 0 && (
          <ul className="error">
            {evalCase.problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        )}
        {error && <p className="error">{error}</p>}

        <div className="actions form-actions">
          <button type="button" className="ghost danger" style={{ marginRight: 'auto' }} onClick={() => setConfirmDelete(true)}>
            Delete
          </button>
          <button type="button" className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-outcome" disabled={saving}>
            {saving ? 'Saving…' : 'Save case'}
          </button>
        </div>
      </form>
      {confirmDelete && (
        <ConfirmDialog
          title="Delete this eval case?"
          message="It leaves the eval set. The run trace it came from stays."
          onConfirm={remove}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </Modal>
  );
}

// Every ready case in one file, each as { name, split, label_source,
// document, expected }: the cases/<name>/ folders of agent/evals/, flattened.
function downloadSet(cases) {
  const set = cases.map(({ name, split, label_source, document, expected }) => ({ name, split, label_source, document, expected }));
  const blob = new Blob([`${JSON.stringify(set, null, 2)}\n`], { type: 'application/json' });
  const link = window.document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'eval-set.json';
  link.click();
  URL.revokeObjectURL(link.href);
}
