import { useEffect, useMemo, useRef, useState } from 'react';
import * as api from '../api.js';
import { insightFilterFields, matchesFilters } from '../lib/insightFilters.js';
import {
  IMPACT_AREAS,
  INSIGHT_TYPES,
  REJECTION_REASONS,
  SENTIMENTS,
  formatDollars,
  rejectionReasonLabel,
  sentimentOf,
} from '../lib/links.js';
import LinkedText from './LinkedText.jsx';
import FilterBar from './FilterBar.jsx';
import CollectionRuns, { formatTime } from './CollectionRuns.jsx';
import { ChevronDownIcon } from './icons.jsx';

// Insights waiting for a person: mostly the insight collector's suggestions
// (product/agents/insight-collector/spec.md). Each card shows the excerpt it
// rests on and why it was linked where it was, so the reviewer can check both
// the observation and the links without leaving the page. Nothing here counts
// as evidence until it is approved. Besides links to existing outcomes and
// projects, the collector may propose ones that don't exist yet; the reviewer
// creates one (which links the insight to it but leaves it in review) or
// dismisses it, or approves the insight and creates all of them at once.
// Whatever was proposed, the reviewer can also create an outcome or project of
// their own and link the insight to it. Every field on a card edits in place:
// click it, change it, and it saves. The Runs tab shows the collector's traces.
export default function ReviewQueue({
  accountId,
  insights,
  outcomes,
  projects,
  teams,
  onApprove,
  onReject,
  onUpdate,
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
  const inTab = tab === 'pending' ? pending : rejected;

  // Suggestions narrow with the insights page's filters, all but status:
  // everything here is a suggestion or a rejected one, and the tabs split those.
  const [filters, setFilters] = useState({});
  const fields = useMemo(
    () => insightFilterFields({ insights, outcomes, projects, teams }).filter((field) => field.id !== 'status'),
    [insights, outcomes, projects, teams],
  );
  const shown = inTab.filter((insight) => matchesFilters(insight, fields, filters));

  function countFor(fieldId, optionId) {
    const field = fields.find((entry) => entry.id === fieldId);
    return inTab.filter(
      (insight) => field.values(insight).includes(optionId) && matchesFilters(insight, fields, filters, fieldId),
    ).length;
  }

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
      {tab !== 'runs' && inTab.length > 0 && (
        <FilterBar fields={fields} filters={filters} onChange={setFilters} countFor={countFor} />
      )}
      {tab === 'runs' ? (
        <CollectionRuns accountId={accountId} />
      ) : inTab.length === 0 ? (
        <p className="empty">
          {tab === 'pending'
            ? 'Nothing to review. Suggested insights from the insight collector show up here.'
            : 'No rejected suggestions.'}
        </p>
      ) : shown.length === 0 ? (
        <p className="empty">No suggestions match.</p>
      ) : (
        <ul className="review-list">
          {[...shown].reverse().map((insight) => (
            <ReviewCard
              key={insight.id}
              insight={insight}
              outcomes={outcomes}
              projects={projects}
              teams={teams}
              onApprove={onApprove}
              onReject={onReject}
              onUpdate={onUpdate}
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
  teams,
  onApprove,
  onReject,
  onUpdate,
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

  // Saves one field edited in place. Unlike run, the card stays on screen after.
  async function save(patch) {
    setError(null);
    try {
      await onUpdate(insight, patch);
    } catch (err) {
      setError(`Could not save: ${err.message}`);
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
  // Only suggestions still waiting for review edit in place.
  const locked = !pending || busy;
  // Every outcome and project, ticked when this insight already links to it.
  const linkable = [
    ...outcomes.map((outcome) => ({
      kind: 'outcome',
      id: Number(outcome.id),
      name: outcome.name,
      group: 'Outcomes',
      linked: insight.outcome_ids.map(String).includes(String(outcome.id)),
    })),
    ...projects.map((project) => ({
      kind: 'project',
      id: Number(project.id),
      name: project.name,
      group: 'Projects',
      linked: insight.project_ids.map(String).includes(String(project.id)),
    })),
  ];

  function toggleLink(item) {
    const field = item.kind === 'project' ? 'project_ids' : 'outcome_ids';
    const ids = insight[field].map(Number);
    save({ [field]: item.linked ? ids.filter((id) => id !== item.id) : [...ids, item.id] });
  }

  return (
    <li className="review-card">
      <h3>
        <SentimentSelect value={insight.sentiment} disabled={locked} onChange={(sentiment) => save({ sentiment })} />
        <InlineText
          value={insight.name}
          label="Insight"
          required
          multiline
          disabled={locked}
          onCommit={(name) => save({ name })}
        />
      </h3>
      <p className="meta">
        <PillField label="Type" title="What kind of evidence this is">
          <PillSelect
            label="Type"
            value={insight.type}
            options={INSIGHT_TYPES}
            disabled={locked}
            onChange={(type) => save({ type })}
          />
        </PillField>
        <PillField label="Source" title="Where the collector found it; the link below opens the original">
          <InlineText
            value={insight.source_system ?? ''}
            label="Source"
            placeholder="—"
            pill
            disabled={locked}
            onCommit={(value) => save({ source_system: value || null })}
          />
        </PillField>
        <PillField
          label="Evidence"
          title="Firsthand: the customer's own words or actions, including their words quoted verbatim by someone else. Relayed: someone else's paraphrase or summary."
        >
          <PillSelect
            label="Evidence"
            value={insight.firsthand == null ? '' : String(insight.firsthand)}
            options={EVIDENCE}
            empty="—"
            disabled={locked}
            onChange={(value) => save({ firsthand: value === '' ? null : value === 'true' })}
          />
        </PillField>
        <PillField label="Area" title="The part of the business it affects">
          <PillSelect
            label="Area"
            value={insight.impact_area ?? ''}
            options={IMPACT_AREAS}
            empty="—"
            disabled={locked}
            onChange={(value) => save({ impact_area: value || null })}
          />
        </PillField>
        <PillField label="Impact" title="Estimated dollars at stake">
          <InlineText
            value={insight.dollar_impact ?? ''}
            label="Dollar impact"
            type="number"
            placeholder="—"
            pill
            display={insight.dollar_impact != null ? formatDollars(insight.dollar_impact) : null}
            disabled={locked}
            onCommit={(value) => save({ dollar_impact: value === '' ? null : Number(value) })}
          />
        </PillField>
        <PillField label="Observed" title="When it was seen">
          <input
            className="cell-input pill-date"
            type="date"
            aria-label="Observed"
            disabled={locked}
            value={insight.observed_at ? new Date(insight.observed_at).toISOString().slice(0, 10) : ''}
            onChange={(event) =>
              save({ observed_at: event.target.value ? new Date(event.target.value).toISOString() : null })
            }
          />
        </PillField>
        {teams.length > 0 && (
          <PillField label="Team" title="The team that recorded it">
            <PillSelect
              label="Team"
              value={insight.team_id ? String(insight.team_id) : ''}
              options={teams.map((team) => ({ id: String(team.id), label: team.name }))}
              empty="—"
              disabled={locked}
              onChange={(value) => save({ team_id: value ? Number(value) : null })}
            />
          </PillField>
        )}
        {insight.edited_in_review && <span className="tag parent">Edited</span>}
        <span className="id">#{insight.id}</span>
      </p>
      {insight.source_excerpt && <blockquote className="excerpt">“{insight.source_excerpt}”</blockquote>}
      {/* Who it's from runs into where it's from, like a citation under the quote. */}
      <p className="source-row">
        <InlineText
          value={insight.description ?? ''}
          label="Details"
          placeholder={locked ? '' : 'Add details'}
          multiline
          className="description"
          disabled={locked}
          onCommit={(value) => save({ description: value || null })}
        />{' '}
        <SourceLine insight={insight} disabled={locked} onSave={save} />
      </p>

      <div className="review-links">        <span className="hint">Supports</span>
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
            {linkable.length > 0 && (
              <LinkExisting items={linkable} disabled={busy} onToggle={toggleLink} />
            )}
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
            <button type="button" className="ghost" disabled={busy} onClick={() => setRejecting(true)}>
              Reject…
            </button>
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

const EVIDENCE = [
  { id: 'true', label: 'Firsthand' },
  { id: 'false', label: 'Relayed' },
];

// Where to go to check the observation: the link into the external tool when
// there is one, otherwise whatever reference was recorded. Clicking the text
// edits it; the arrow beside a link opens it.
// "Link existing…" opens a filterable checklist of every outcome and project;
// ticking one links the insight to it and unticking unlinks it, so several can
// be picked without reopening the menu.
function LinkExisting({ items, disabled, onToggle }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event) {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    }
    function onKeyDown(event) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const needle = query.trim().toLowerCase();
  const matches = needle ? items.filter((item) => item.name.toLowerCase().includes(needle)) : items;

  return (
    <div className="link-existing multi-select-anchor" ref={ref}>
      <button
        type="button"
        className="ghost small"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => {
          setQuery('');
          setOpen((current) => !current);
        }}
      >
        Link existing… <ChevronDownIcon />
      </button>
      {open && (
        <div className="multi-select-menu">
          <input
            autoFocus
            value={query}
            placeholder="Search outcomes and projects…"
            aria-label="Search outcomes and projects"
            onChange={(event) => setQuery(event.target.value)}
          />
          <ul role="listbox" aria-multiselectable="true" aria-label="Link to existing outcomes and projects">
            {matches.length === 0 && <li className="hint">No matches.</li>}
            {['Outcomes', 'Projects'].map((group) => {
              const inGroup = matches.filter((item) => item.group === group);
              return inGroup.length === 0
                ? null
                : [
                    <li key={group} className="multi-select-group" role="presentation">
                      {group}
                    </li>,
                    ...inGroup.map((item) => (
                      <li key={`${item.kind}:${item.id}`} role="option" aria-selected={item.linked}>
                        <label>
                          <input type="checkbox" checked={item.linked} onChange={() => onToggle(item)} />
                          {item.name}
                        </label>
                      </li>
                    )),
                  ];
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function SourceLine({ insight, disabled, onSave }) {
  if (insight.source_url) {
    return (
      <span className="hint source-line">
        {disabled ? (
          <a href={insight.source_url} target="_blank" rel="noreferrer">
            {insight.source_external_id || 'Open source'}
          </a>
        ) : (
          <>
            <InlineText
              value={insight.source_url}
              display={insight.source_external_id || insight.source_url}
              label="Source link"
              className="source-link"
              // The old label named the old link, so a new link drops it.
              onCommit={(url) => onSave({ source_url: url || null, source_external_id: null })}
            />
            <a href={insight.source_url} target="_blank" rel="noreferrer" title="Open source" aria-label="Open source">
              ↗
            </a>
          </>
        )}
      </span>
    );
  }
  const reference = insight.source || insight.source_external_id;
  if (disabled) {
    return reference ? (
      <span className="hint">
        <LinkedText text={reference} />
      </span>
    ) : null;
  }
  return (
    <span className="hint source-line">
      <InlineText
        value={insight.source ?? ''}
        display={reference || null}
        label="Source"
        placeholder="Add a source"
        onCommit={(source) => onSave({ source: source || null })}
      />
    </span>
  );
}

// A field name beside its value, e.g. "Type [Interview]".
function PillField({ label, title, children }) {
  return (
    <span className="tag-field" title={title}>
      <span className="tag-key">{label}</span>
      {children}
    </span>
  );
}

// A choice that reads as a tag; `empty`, when given, labels the no-value option.
function PillSelect({ label, value, options, empty, disabled, onChange }) {
  return (
    <select
      className={value ? 'cell-input pill' : 'cell-input pill empty'}
      data-value={value}
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    >
      {empty !== undefined && <option value="">{empty}</option>}
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function SentimentSelect({ value, disabled, onChange }) {
  return (
    <select
      className="cell-input sentiment-select"
      aria-label="Sentiment"
      title={sentimentOf(value)?.label ?? 'No sentiment'}
      value={value ?? ''}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value || null)}
    >
      <option value="">—</option>
      {SENTIMENTS.map((sentiment) => (
        <option key={sentiment.id} value={sentiment.id}>
          {sentiment.emoji} {sentiment.label}
        </option>
      ))}
    </select>
  );
}

// Text that becomes an input when clicked and saves when you click away or
// press Enter; Escape puts back what was there. `display`, when given, is what
// shows while it isn't being edited. `multiline` edits in a textarea that grows
// to fit (Shift+Enter for a new line); `pill` shows the value as a tag.
function InlineText({ value, label, display, placeholder = '', type = 'text', required, multiline, pill, className = '', disabled, onCommit }) {
  const [draft, setDraft] = useState(null);
  // Set by Escape, so the blur that follows doesn't save.
  const cancelled = useRef(false);
  const current = String(value);
  const shown = display ?? current;

  if (disabled || draft === null) {
    const empty = !shown;
    if (disabled && empty) return pill ? <span className="tag project empty">—</span> : null;
    const classes = [
      pill ? 'tag project' : '',
      empty ? 'empty' : '',
      disabled ? '' : 'inline-edit',
      className,
    ].filter(Boolean).join(' ');
    if (disabled) return <span className={classes}>{shown}</span>;
    return (
      <span
        className={classes}
        role="button"
        tabIndex={0}
        aria-label={`Edit ${label.toLowerCase()}`}
        title="Click to edit"
        onClick={() => setDraft(current)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setDraft(current);
          }
        }}
      >
        {empty ? placeholder : shown}
      </span>
    );
  }

  function commit() {
    const next = draft.trim();
    setDraft(null);
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    if (next === current || (required && !next)) return;
    onCommit(next);
  }

  function onKeyDown(event) {
    if (event.key === 'Enter' && !(multiline && event.shiftKey)) {
      event.preventDefault();
      event.currentTarget.blur();
    }
    if (event.key === 'Escape') {
      cancelled.current = true;
      event.currentTarget.blur();
    }
  }

  const classes = `cell-input inline-input${pill ? ' pill-input' : ''} ${className}`.trim();
  return multiline ? (
    <textarea
      className={classes}
      rows={1}
      autoFocus
      aria-label={label}
      value={draft}
      ref={fitHeight}
      onChange={(event) => {
        setDraft(event.target.value);
        fitHeight(event.target);
      }}
      onBlur={commit}
      onKeyDown={onKeyDown}
    />
  ) : (
    <input
      className={classes}
      type={type}
      step={type === 'number' ? '0.01' : undefined}
      autoFocus
      aria-label={label}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
    />
  );
}

function fitHeight(textarea) {
  if (!textarea) return;
  textarea.style.height = 'auto';
  textarea.style.height = `${textarea.scrollHeight + 2}px`;
}
