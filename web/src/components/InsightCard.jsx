import { useState } from 'react';
import { IMPACT_AREAS, INSIGHT_TYPES, formatDollars } from '../lib/links.js';
import {
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

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// One insight with every field editable in place: click a field, change it,
// and it saves. The outcome and project counts open checklists that link and
// unlink it. The quote is what the source said, so it stays as recorded.
// onUpdate(insight, patch) saves; a failure shows under the card.
export default function InsightCard({ insight, outcomes, projects, onUpdate }) {
  const [error, setError] = useState(null);

  async function save(patch) {
    setError(null);
    try {
      await onUpdate(insight, patch);
    } catch (err) {
      setError(`Could not save: ${err.message}`);
    }
  }

  const linkable = linkableItems(insight, outcomes, projects);
  const toggle = (item) => save(toggleLinkPatch(insight, item));

  return (
    <div className="insight-card">
      <h3>
        <SentimentSelect value={insight.sentiment} onChange={(sentiment) => save({ sentiment })} />
        <InlineText value={insight.name} label="Insight" required multiline onCommit={(name) => save({ name })} />
      </h3>
      <div className="meta">
        {insight.status === 'unvalidated' && (
          <span className="tag parent" title="Waiting for review; not counted as evidence yet">
            Suggested
          </span>
        )}
        <PillField label="Type" title="What kind of evidence this is">
          <PillSelect label="Type" value={insight.type} options={INSIGHT_TYPES} onChange={(type) => save({ type })} />
        </PillField>
        <PillField label="Supports" title="The outcomes and projects this is evidence for">
          <LinkPicker
            items={linkable.filter((item) => item.kind === 'outcome')}
            label="Supports outcomes"
            buttonClassName="tag link-pill"
            onToggle={toggle}
          >
            {plural(insight.outcome_ids.length, 'outcome')}
          </LinkPicker>
          <LinkPicker
            items={linkable.filter((item) => item.kind === 'project')}
            label="Supports projects"
            buttonClassName="tag project link-pill"
            onToggle={toggle}
          >
            {plural(insight.project_ids.length, 'project')}
          </LinkPicker>
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
            onChange={(value) => save({ firsthand: value === '' ? null : value === 'true' })}
          />
        </PillField>
        <PillField label="Area" title="The part of the business it affects">
          <PillSelect
            label="Area"
            value={insight.impact_area ?? ''}
            options={IMPACT_AREAS}
            empty="—"
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
            onCommit={(value) => save({ dollar_impact: value === '' ? null : Number(value) })}
          />
        </PillField>
        <PillField label="Observed" title="When it was seen">
          <input
            className="cell-input pill-date"
            type="date"
            aria-label="Observed"
            value={insight.observed_at ? new Date(insight.observed_at).toISOString().slice(0, 10) : ''}
            onChange={(event) =>
              save({ observed_at: event.target.value ? new Date(event.target.value).toISOString() : null })
            }
          />
        </PillField>
        <span className="id">#{insight.id}</span>
      </div>
      {insight.source_excerpt && <blockquote className="excerpt">“{insight.source_excerpt}”</blockquote>}
      <p className="source-row">
        <InlineText
          value={insight.description ?? ''}
          label="Details"
          placeholder="Add details"
          multiline
          className="description"
          onCommit={(value) => save({ description: value || null })}
        />{' '}
        <SourceLine insight={insight} onSave={save} />
      </p>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

// A one-line box for a new insight's observation: Enter adds it, and the rest
// is then filled in on its card. Escape, or leaving it empty, closes it.
// onCreate(name) resolves once it exists.
export function NewInsight({ onCreate, onClose }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function submit(event) {
    event.preventDefault();
    if (!name.trim()) return onClose();
    setSaving(true);
    setError(null);
    try {
      await onCreate(name.trim());
      setName('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="new-insight" onSubmit={submit}>
      <input
        autoFocus
        value={name}
        aria-label="New insight"
        placeholder="New insight, e.g. 11 of 14 interviewed admins abandoned setup at the SSO step. Enter to add"
        disabled={saving}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => event.key === 'Escape' && onClose()}
        onBlur={() => !name.trim() && onClose()}
      />
      {error && <p className="error">{error}</p>}
    </form>
  );
}
