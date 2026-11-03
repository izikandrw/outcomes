import { useEffect, useMemo, useRef, useState } from 'react';
import * as api from '../api.js';
import { insightFilterFields, matchesFilters } from '../lib/insightFilters.js';
import { IMPACT_AREAS, INSIGHT_TYPES, REJECTION_REASONS, formatDollars, rejectionReasonLabel } from '../lib/links.js';
import { isTypingTarget, reviewAction, reviewLegend, worksInField } from '../lib/reviewShortcuts.js';
import useStuck from '../lib/useStuck.js';
import FilterBar from './FilterBar.jsx';
import CollectionRuns, { formatTime } from './CollectionRuns.jsx';
import EvalCases from './EvalCases.jsx';
import {
  DateField,
  EVIDENCE,
  InlineText,
  LinkPicker,
  PillField,
  PillSelect,
  SentimentSelect,
  SourceLine,
  linkableItems,
  toggleLinkPatch,
} from './InlineFields.jsx';

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
// click it, change it, and it saves. The Runs tab shows the collector's traces,
// and the Eval set tab the cases picked from them. The whole queue works from
// the keyboard (lib/reviewShortcuts.js): one card is always selected, and focus
// sits on it, so J and K move and Tab walks into its fields.
// `view` holds the tab, the open run and the filters ({ tab, run, filters }, a
// null tab meaning Needs review), which the app keeps in the URL.
const REVIEW_TABS = ['pending', 'rejected', 'runs', 'evals'];

export default function ReviewQueue({
  view,
  onViewChange,
  accountId,
  insights,
  outcomes,
  projects,
  onApprove,
  onReject,
  onUpdate,
  onUnlink,
  onCreateProposed,
  onCreateOwn,
  onDismissProposed,
  onAcceptAll,
}) {
  const tab = REVIEW_TABS.includes(view.tab) ? view.tab : 'pending';
  const setTab = (next) => {
    lastIndex.current = 0;
    onViewChange({ ...view, tab: next === 'pending' ? null : next, run: null });
  };
  const [lastRunAt, setLastRunAt] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const lastIndex = useRef(0);
  const previousId = useRef(null);
  const listRef = useRef(null);
  const legendRef = useRef(null);
  // What the keys do to the selected card, which registers them.
  const cardActions = useRef(null);
  const legendStuck = useStuck(legendRef);
  const pending = insights.filter((insight) => insight.status === 'unvalidated');
  const rejected = insights.filter((insight) => insight.status === 'rejected');
  const inTab = tab === 'pending' ? pending : rejected;

  // Suggestions narrow with the insights page's filters, all but status:
  // everything here is a suggestion or a rejected one, and the tabs split those.
  const { filters } = view;
  const setFilters = (next) => onViewChange({ ...view, filters: next });
  const fields = useMemo(
    () => insightFilterFields({ insights, outcomes, projects }).filter((field) => field.id !== 'status'),
    [insights, outcomes, projects],
  );
  const shown = inTab.filter((insight) => matchesFilters(insight, fields, filters));
  const listed = ['runs', 'evals'].includes(tab) ? [] : [...shown].reverse();
  const ids = listed.map((insight) => insight.id);

  // Approving, rejecting or filtering can take the selected card off the list;
  // the one that moved into its place is then selected.
  const found = ids.indexOf(selectedId);
  const currentIndex = found >= 0 ? found : Math.min(lastIndex.current, ids.length - 1);
  const currentId = ids[currentIndex] ?? null;
  lastIndex.current = Math.max(currentIndex, 0);

  function focusCard(id, scroll = true) {
    const card = listRef.current?.querySelector(`[data-insight-id="${id}"]`);
    if (!card) return;
    card.focus({ preventScroll: true });
    // A card taller than the window starts from its top, not its nearest edge.
    if (scroll) card.scrollIntoView({ block: card.offsetHeight > window.innerHeight ? 'start' : 'nearest' });
  }

  // Focus lands on the selected card when nothing else holds it: on arriving, and
  // after the card it was on has gone. Elsewhere, like the filter bar, it stays put.
  useEffect(() => {
    const moved = previousId.current != null && previousId.current !== currentId;
    previousId.current = currentId;
    if (currentId == null) return;
    const active = document.activeElement;
    if (!active || active === document.body) focusCard(currentId, moved);
  }, [currentId]);

  // Registered afresh each render, so it always sees the current list.
  useEffect(() => {
    function onKeyDown(event) {
      const action = reviewAction(event);
      if (!action || currentId == null) return;
      if (document.querySelector('[role="dialog"], dialog[open]')) return;
      const { target } = event;
      // By now Enter may have saved a text field and removed it from the page, so
      // ask the path the key took rather than the target's current ancestors.
      const within = (className) => event.composedPath().some((node) => node.classList?.contains(className));
      // These handle their own keys.
      if (within('multi-select-menu') || within('reject-form')) return;
      if (isTypingTarget(target) && !(within('review-card') && worksInField(action, target))) return;
      if (action === 'next' || action === 'previous') {
        event.preventDefault();
        const next = currentIndex + (action === 'next' ? 1 : -1);
        if (next >= 0 && next < ids.length) focusCard(ids[next]);
        return;
      }
      // Holding a key down must not run through the queue approving everything.
      if (event.repeat) return;
      event.preventDefault();
      cardActions.current?.[action]?.();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  });

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
          <button
            type="button"
            aria-pressed={tab === 'evals'}
            onClick={() => setTab('evals')}
            title="Documents with the answer the collector should give, for scoring a model or prompt version"
          >
            Eval set
          </button>
        </div>
      </div>
      {!['runs', 'evals'].includes(tab) && inTab.length > 0 && (
        <div
          ref={legendRef}
          className={`list-toolbar review-shortcuts${legendStuck ? ' stuck' : ''}`}
          role="note"
          aria-label="Keyboard shortcuts"
        >
          {reviewLegend(tab, { mac: /Mac|iPhone|iPad/.test(navigator.platform) }).map(({ keys, label }) => (
            <span key={label} className="shortcut">
              {keys.map((key) => (
                <kbd key={key}>{key}</kbd>
              ))}
              {label}
            </span>
          ))}
        </div>
      )}
      {!['runs', 'evals'].includes(tab) && inTab.length > 0 && (
        <FilterBar fields={fields} filters={filters} onChange={setFilters} countFor={countFor} />
      )}
      {tab === 'evals' ? (
        <EvalCases accountId={accountId} />
      ) : tab === 'runs' ? (
        <CollectionRuns
          accountId={accountId}
          outcomes={outcomes}
          projects={projects}
          openId={view.run}
          onOpen={(run) => onViewChange({ ...view, run: run == null ? null : String(run) })}
          onOpenEvalSet={() => setTab('evals')}
        />
      ) : inTab.length === 0 ? (
        <p className="empty">
          {tab === 'pending'
            ? 'Nothing to review. Suggested insights from the insight collector show up here.'
            : 'No rejected suggestions.'}
        </p>
      ) : shown.length === 0 ? (
        <p className="empty">No suggestions match.</p>
      ) : (
        <ul className="review-list" ref={listRef}>
          {listed.map((insight) => (
            <ReviewCard
              key={insight.id}
              insight={insight}
              selected={insight.id === currentId}
              onSelect={() => setSelectedId(insight.id)}
              actionsRef={cardActions}
              outcomes={outcomes}
              projects={projects}
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
  selected,
  onSelect,
  actionsRef,
  outcomes,
  projects,
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
  const cardRef = useRef(null);
  const savingNow = useRef(null);

  async function run(action) {
    setBusy(true);
    setError(null);
    try {
      // Approving from inside a field saves it on the way out. That has to land
      // first, and if it fails the insight stays here with the error showing.
      await savingNow.current;
      await action();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  // Saves one field edited in place. Unlike run, the card stays on screen after.
  function save(patch) {
    setError(null);
    const saving = onUpdate(insight, patch);
    savingNow.current = saving;
    saving
      .catch((err) => setError(`Could not save: ${err.message}`))
      .finally(() => {
        if (savingNow.current === saving) savingNow.current = null;
      });
  }

  function confirmReject() {
    if (!busy) run(() => onReject(insight, reason, note.trim() || null));
  }

  function cancelReject() {
    setRejecting(false);
    cardRef.current.focus();
  }

  function onRejectFormKey(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelReject();
    } else if (event.key === 'Enter' && event.target.tagName !== 'BUTTON') {
      event.preventDefault();
      confirmReject();
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
  const linkable = linkableItems(insight, outcomes, projects);

  // The review queue's keys act on the selected card, through what it would click.
  useEffect(() => {
    if (!selected) return;
    const click = (selector) => cardRef.current.querySelector(selector)?.click();
    const idle = !busy && !rejecting;
    const approve = () => idle && run(() => onApprove(insight));
    actionsRef.current = {
      approve,
      submit: approve,
      approveAll: () => idle && pending && proposals.length > 0 && run(() => onAcceptAll(insight)),
      reject: () => idle && pending && setRejecting(true),
      edit: () => idle && click('h3 .inline-edit'),
      link: () => idle && click('.link-existing > button'),
      open: () => click('.source-row a[href]'),
      leave: () => cardRef.current.focus(),
    };
  });

  return (
    <li
      ref={cardRef}
      className={`review-card${selected ? ' selected' : ''}`}
      data-insight-id={insight.id}
      tabIndex={-1}
      aria-current={selected || undefined}
      onFocus={onSelect}
    >
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
          <DateField
            label="Observed"
            disabled={locked}
            value={insight.observed_at ? new Date(insight.observed_at).toISOString().slice(0, 10) : ''}
            onCommit={(value) => save({ observed_at: value ? new Date(value).toISOString() : null })}
          />
        </PillField>
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
              <LinkPicker
                items={linkable}
                label="Link to existing outcomes and projects"
                disabled={busy}
                onToggle={(item) => save(toggleLinkPatch(insight, item))}
              >
                Link existing…
              </LinkPicker>
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
        <div className="reject-form" onKeyDown={onRejectFormKey}>
          <select autoFocus value={reason} aria-label="Reason" onChange={(event) => setReason(event.target.value)}>
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
            <button type="button" className="ghost" disabled={busy} onClick={cancelReject}>
              Cancel
            </button>
            <button type="button" className="danger-solid" disabled={busy} onClick={confirmReject}>
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
