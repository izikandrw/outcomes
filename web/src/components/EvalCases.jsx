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

// A new expected not-insight: something the collector should leave alone.
const blankNotInsight = (excerpt) => ({ excerpt, name: '', reason: 'not_an_insight' });

const INSIGHT_TYPES = [
  'support_ticket',
  'session_recording',
  'interview',
  'funnel',
  'experiment',
  'sales_call',
  'feature_request',
  'survey',
  'review',
  'other',
];

// Matches the server's excerpt check (src/lib/evalCases.js): whitespace, curly
// quotes and case don't count.
const normalise = (text) =>
  String(text ?? '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

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
  const [mode, setMode] = useState('easy');
  // Links point into the catalog frozen with the case, so its score can't move
  // when outcomes change later. "Use today's catalog" swaps in the current one,
  // saved with the case.
  const [catalog, setCatalog] = useState(evalCase.catalog ?? { outcomes: [], projects: [] });
  const [refreshCatalog, setRefreshCatalog] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const textRef = useRef(null);

  async function switchToTodaysCatalog() {
    try {
      const [outcomes, projects] = await Promise.all([api.listOutcomes(accountId), api.listProjects(accountId)]);
      const pick = (rows) => rows.map(({ id, name, description }) => ({ id: String(id), name, description: description ?? null }));
      setCatalog({ outcomes: pick(outcomes), projects: pick(projects) });
      setRefreshCatalog(true);
    } catch (err) {
      setError(err.message);
    }
  }

  // Both modes edit the same JSON text, so switching between them loses nothing.
  let parsedAnswer = null;
  try {
    parsedAnswer = JSON.parse(answer);
  } catch {
    // Easy mode says so; JSON mode lets it be fixed.
  }
  const setParsedAnswer = (next) => setAnswer(JSON.stringify(next, null, 2));

  // Text selected inside the document can become an expected insight's excerpt.
  function noteSelection() {
    const selected = window.getSelection();
    const inside = selected && textRef.current?.contains(selected.anchorNode);
    setSelection(inside ? selected.toString().trim() : '');
  }

  function addSelectionAs(field, blank) {
    if (!parsedAnswer) {
      setError('Fix the expected answer’s JSON before adding to it.');
      return;
    }
    setParsedAnswer({ ...parsedAnswer, [field]: [...(parsedAnswer[field] ?? []), blank(selection)] });
    setSelection('');
    setError(null);
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
        ...(refreshCatalog ? { refresh_catalog: true } : {}),
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
            <div className="actions">
              <button type="button" className="ghost small" onClick={() => addSelectionAs('insights', blankInsight)}>
                Use selection as a new expected insight’s excerpt
              </button>
              <button type="button" className="ghost small" onClick={() => addSelectionAs('not_insights', blankNotInsight)}>
                …as a not-insight
              </button>
            </div>
          )}
        </div>

        <div className="eval-case-answer">
          <div className="eval-case-answer-head">
            <span className="eval-case-label">Expected answer</span>
            <div className="view-toggle" role="group" aria-label="Edit the expected answer as">
              <button type="button" aria-pressed={mode === 'easy'} onClick={() => setMode('easy')}>
                Easy mode
              </button>
              <button type="button" aria-pressed={mode === 'json'} onClick={() => setMode('json')}>
                JSON
              </button>
            </div>
          </div>
          <p className="hint eval-case-catalog">
            {refreshCatalog
              ? `Using today’s catalog (${catalog.outcomes.length} outcomes, ${catalog.projects.length} projects); it replaces the frozen one when you save.`
              : `Links point into the ${catalog.outcomes.length} outcomes and ${catalog.projects.length} projects frozen with this case, which the eval also gives the model, so later changes to your outcomes don’t move its score.`}{' '}
            {!refreshCatalog && (
              <button type="button" className="link-button" onClick={switchToTodaysCatalog}>
                Use today’s catalog
              </button>
            )}
          </p>
          {mode === 'easy' ? (
            parsedAnswer && typeof parsedAnswer === 'object' && !Array.isArray(parsedAnswer) ? (
              <EasyAnswer
                answer={parsedAnswer}
                onChange={setParsedAnswer}
                documentText={evalCase.document.text}
                catalog={catalog}
              />
            ) : (
              <p className="error">The JSON has a mistake in it. Fix it under JSON, then come back.</p>
            )
          ) : (
            <label>
              <textarea
                className="eval-case-json"
                rows={14}
                spellCheck={false}
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
              />
              <span className="hint">
                insights: what the collector should find (excerpt, name, type, sentiment, firsthand, dollar_impact,
                links). not_insights: what it should leave alone.
              </span>
            </label>
          )}
        </div>

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

// The expected answer as a form: a card per expected insight and not-insight,
// and the case's tags. Keys it doesn't show are kept as they are.
function EasyAnswer({ answer, onChange, documentText, catalog }) {
  const text = normalise(documentText);
  const insights = Array.isArray(answer.insights) ? answer.insights : [];
  const notInsights = Array.isArray(answer.not_insights) ? answer.not_insights : [];
  const tags = Array.isArray(answer.tags) ? answer.tags : [];
  const [tagText, setTagText] = useState(tags.join(', '));

  const setList = (field, list) => onChange({ ...answer, [field]: list });
  const updateAt = (field, list, i, entry) => setList(field, list.map((old, j) => (j === i ? entry : old)));
  const removeAt = (field, list, i) => setList(field, list.filter((_, j) => j !== i));
  // An expected insight that turns out not to be one, or the other way round.
  const moveTo = (from, fromList, i, to, blank) =>
    onChange({
      ...answer,
      [from]: fromList.filter((_, j) => j !== i),
      [to]: [...(answer[to] ?? []), { ...blank(fromList[i].excerpt ?? ''), name: fromList[i].name ?? '' }],
    });
  const excerptFound = (excerpt) => Boolean(excerpt) && text.includes(normalise(excerpt));

  return (
    <div className="eval-easy">
      <div className="eval-easy-section">
        <span className="eval-case-label">
          Insights <span className="hint">· what the collector should find ({insights.length})</span>
        </span>
        {insights.map((insight, i) => (
          <InsightCard
            key={i}
            insight={insight}
            found={excerptFound(insight.excerpt)}
            catalog={catalog}
            onChange={(entry) => updateAt('insights', insights, i, entry)}
            onRemove={() => removeAt('insights', insights, i)}
            onMove={() => moveTo('insights', insights, i, 'not_insights', blankNotInsight)}
          />
        ))}
        <button type="button" className="ghost small" onClick={() => setList('insights', [...insights, blankInsight('')])}>
          + Add insight
        </button>
      </div>

      <div className="eval-easy-section">
        <span className="eval-case-label">
          Not insights <span className="hint">· what it should leave alone ({notInsights.length})</span>
        </span>
        {notInsights.map((entry, i) => (
          <NotInsightCard
            key={i}
            entry={entry}
            found={excerptFound(entry.excerpt)}
            onChange={(next) => updateAt('not_insights', notInsights, i, next)}
            onRemove={() => removeAt('not_insights', notInsights, i)}
            onMove={() => moveTo('not_insights', notInsights, i, 'insights', blankInsight)}
          />
        ))}
        <button
          type="button"
          className="ghost small"
          onClick={() => setList('not_insights', [...notInsights, blankNotInsight('')])}
        >
          + Add not-insight
        </button>
      </div>

      <label>
        Tags
        <input
          value={tagText}
          placeholder="attention, firsthand, single-insight"
          onChange={(event) => {
            setTagText(event.target.value);
            setList(
              'tags',
              event.target.value
                .split(',')
                .map((tag) => tag.trim())
                .filter(Boolean),
            );
          }}
        />
        <span className="hint">Comma-separated.</span>
      </label>
    </div>
  );
}

function ExcerptField({ value, found, onChange }) {
  return (
    <label>
      Excerpt
      <textarea rows={2} value={value ?? ''} onChange={(event) => onChange(event.target.value)} />
      {value ? (
        <span className={found ? 'hint' : 'error'}>{found ? '✓ In the document' : 'Not in the document word for word'}</span>
      ) : (
        <span className="hint">The exact words it rests on: select them in the document above, or paste them.</span>
      )}
    </label>
  );
}

function InsightCard({ insight, found, catalog, onChange, onRemove, onMove }) {
  const set = (key, value) => onChange({ ...insight, [key]: value });
  const links = Array.isArray(insight.links) ? insight.links : [];
  const proposed = Array.isArray(insight.proposed) ? insight.proposed : [];
  const linked = new Set(links.map((link) => `${link.kind}:${link.id}`));

  function addLink(value) {
    const [kind, id] = value.split(':');
    const item = catalog[kind === 'outcome' ? 'outcomes' : 'projects'].find((entry) => String(entry.id) === id);
    if (item) set('links', [...links, { kind, id: String(item.id), name: item.name }]);
  }

  return (
    <div className="eval-easy-card">
      <ExcerptField value={insight.excerpt} found={found} onChange={(value) => set('excerpt', value)} />
      <label>
        Name
        <input
          value={insight.name ?? ''}
          placeholder="One specific observation someone could check"
          onChange={(event) => set('name', event.target.value)}
        />
      </label>
      <div className="eval-case-row">
        <label>
          Type
          <select value={insight.type ?? 'other'} onChange={(event) => set('type', event.target.value)}>
            {INSIGHT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type.replace('_', ' ')}
              </option>
            ))}
          </select>
        </label>
        <label>
          Sentiment
          <select value={insight.sentiment ?? ''} onChange={(event) => set('sentiment', event.target.value || null)}>
            <option value="">not set</option>
            <option value="positive">positive</option>
            <option value="neutral">neutral</option>
            <option value="negative">negative</option>
          </select>
        </label>
        <label>
          Evidence
          <select
            value={insight.firsthand === true ? 'true' : insight.firsthand === false ? 'false' : ''}
            onChange={(event) => set('firsthand', event.target.value === '' ? null : event.target.value === 'true')}
          >
            <option value="">not set</option>
            <option value="true">firsthand: their own words</option>
            <option value="false">relayed: a paraphrase</option>
          </select>
        </label>
        <label>
          Dollar impact
          <input
            type="number"
            value={insight.dollar_impact ?? ''}
            placeholder="only if stated"
            onChange={(event) => set('dollar_impact', event.target.value === '' ? null : Number(event.target.value))}
          />
        </label>
      </div>
      <div className="eval-easy-links">
        <span className="eval-case-label">Links</span>
        {links.map((link, i) => (
          <span key={`${link.kind}:${link.id ?? link.name}`} className={link.kind === 'project' ? 'tag project' : 'tag'}>
            {link.name ?? `${link.kind} ${link.id}`}{' '}
            <button
              type="button"
              className="link-button"
              aria-label={`Remove link to ${link.name ?? link.id}`}
              onClick={() => set('links', links.filter((_, j) => j !== i))}
            >
              ×
            </button>
          </span>
        ))}
        {proposed.map((link, i) => (
          <span key={`proposed:${link.kind}:${link.name}`} className="tag proposed" title={`Proposed ${link.kind}`}>
            {link.name}{' '}
            <button
              type="button"
              className="link-button"
              aria-label={`Remove proposed ${link.name}`}
              onClick={() => set('proposed', proposed.filter((_, j) => j !== i))}
            >
              ×
            </button>
          </span>
        ))}
        <select value="" onChange={(event) => addLink(event.target.value)}>
          <option value="">Link an outcome or project…</option>
          <optgroup label="Outcomes">
            {catalog.outcomes
              .filter((outcome) => !linked.has(`outcome:${outcome.id}`))
              .map((outcome) => (
                <option key={outcome.id} value={`outcome:${outcome.id}`}>
                  {outcome.name}
                </option>
              ))}
          </optgroup>
          <optgroup label="Projects">
            {catalog.projects
              .filter((project) => !linked.has(`project:${project.id}`))
              .map((project) => (
                <option key={project.id} value={`project:${project.id}`}>
                  {project.name}
                </option>
              ))}
          </optgroup>
        </select>
      </div>
      <div className="actions">
        <button type="button" className="ghost small" onClick={onMove}>
          Not an insight after all
        </button>
        <button type="button" className="ghost small danger" onClick={onRemove}>
          Remove
        </button>
      </div>
    </div>
  );
}

function NotInsightCard({ entry, found, onChange, onRemove, onMove }) {
  const set = (key, value) => onChange({ ...entry, [key]: value });
  return (
    <div className="eval-easy-card">
      <ExcerptField value={entry.excerpt} found={found} onChange={(value) => set('excerpt', value)} />
      <div className="eval-case-row">
        <label>
          Name
          <input
            value={entry.name ?? ''}
            placeholder="What the collector might wrongly suggest"
            onChange={(event) => set('name', event.target.value)}
          />
        </label>
        <label>
          Reason
          <select value={entry.reason ?? 'not_an_insight'} onChange={(event) => set('reason', event.target.value)}>
            <option value="not_an_insight">not an insight</option>
            <option value="inaccurate">inaccurate</option>
          </select>
        </label>
      </div>
      <label>
        Note
        <input
          value={entry.note ?? ''}
          placeholder="Why not, e.g. our rep’s opinion"
          onChange={(event) => {
            const { note: _note, ...rest } = entry;
            onChange(event.target.value ? { ...rest, note: event.target.value } : rest);
          }}
        />
      </label>
      <div className="actions">
        <button type="button" className="ghost small" onClick={onMove}>
          It’s an insight after all
        </button>
        <button type="button" className="ghost small danger" onClick={onRemove}>
          Remove
        </button>
      </div>
    </div>
  );
}

// Every ready case in one file, each as { name, split, label_source,
// document, expected, catalog }: the cases/<name>/ folders of agent/evals/,
// flattened, each with the catalog it was labelled against.
function downloadSet(cases) {
  const set = cases.map(({ name, split, label_source, document, expected, catalog }) => ({ name, split, label_source, document, expected, catalog }));
  const blob = new Blob([`${JSON.stringify(set, null, 2)}\n`], { type: 'application/json' });
  const link = window.document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'eval-set.json';
  link.click();
  URL.revokeObjectURL(link.href);
}
