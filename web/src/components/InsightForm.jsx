import { useState } from 'react';
import { IMPACT_AREAS, INSIGHT_TYPES, SENTIMENTS } from '../lib/links.js';
import MultiSelect from './MultiSelect.jsx';

// Creates an insight or edits one in place. Evidence is linked to the outcomes
// and projects it supports from here (a new insight started from an outcome
// arrives already linked to it), since an insight is reusable across both.
export default function InsightForm({ editing, outcome, project, outcomes, projects, onSubmit, onCancel, onDelete }) {
  const [form, setForm] = useState({
    name: editing?.name ?? '',
    type: editing?.type ?? 'interview',
    description: editing?.description ?? '',
    source: editing?.source ?? '',
    observed_at: asDateInput(editing?.observed_at),
    dollar_impact: editing?.dollar_impact ?? '',
    impact_area: editing?.impact_area ?? '',
    sentiment: editing?.sentiment ?? '',
  });
  const [outcomeIds, setOutcomeIds] = useState(
    () => new Set((editing ? editing.outcome_ids : outcome ? [outcome.id] : []).map(String))
  );
  const [projectIds, setProjectIds] = useState(
    () => new Set((editing ? editing.project_ids : project ? [project.id] : []).map(String))
  );
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  async function submit(event) {
    event.preventDefault();
    if (!form.name.trim()) return setError('Name is required.');
    if (form.dollar_impact !== '' && !Number.isFinite(Number(form.dollar_impact)))
      return setError('Dollar impact must be a number.');

    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        name: form.name.trim(),
        type: form.type,
        description: form.description.trim() || null,
        source: form.source.trim() || null,
        observed_at: form.observed_at ? new Date(form.observed_at).toISOString() : null,
        dollar_impact: form.dollar_impact === '' ? null : Number(form.dollar_impact),
        impact_area: form.impact_area || null,
        sentiment: form.sentiment || null,
        outcome_ids: [...outcomeIds].map(Number),
        project_ids: [...projectIds].map(Number),
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="outcome-form" onSubmit={submit}>
      <label>
        Observation
        <input
          autoFocus
          value={form.name}
          placeholder="e.g. 11 of 14 interviewed admins abandoned setup at the SSO step"
          onChange={(event) => update('name', event.target.value)}
        />
      </label>

      <div className="row">
        <label>
          Type
          <select value={form.type} onChange={(event) => update('type', event.target.value)}>
            {INSIGHT_TYPES.map((type) => (
              <option key={type.id} value={type.id}>
                {type.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Sentiment
          <select value={form.sentiment} onChange={(event) => update('sentiment', event.target.value)}>
            <option value="">Not specified</option>
            {SENTIMENTS.map((sentiment) => (
              <option key={sentiment.id} value={sentiment.id}>
                {sentiment.emoji} {sentiment.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="row">
        <label>
          Observed on
          <input
            type="date"
            value={form.observed_at}
            onChange={(event) => update('observed_at', event.target.value)}
          />
        </label>
      </div>

      <div className="row">
        <label>
          Dollar impact
          <input
            type="number"
            step="0.01"
            value={form.dollar_impact}
            placeholder="Estimated $ at stake, e.g. 120000"
            onChange={(event) => update('dollar_impact', event.target.value)}
          />
        </label>
        <label>
          Impact area
          <select value={form.impact_area} onChange={(event) => update('impact_area', event.target.value)}>
            <option value="">Not specified</option>
            {IMPACT_AREAS.map((area) => (
              <option key={area.id} value={area.id}>
                {area.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label>
        Source
        <input
          value={form.source}
          placeholder="A link or reference someone else could go back and check"
          onChange={(event) => update('source', event.target.value)}
        />
      </label>

      <label>
        Details
        <textarea
          rows={3}
          value={form.description}
          onChange={(event) => update('description', event.target.value)}
        />
      </label>

      <MultiSelect
        label="Supports outcomes"
        placeholder="Select outcomes…"
        items={outcomes}
        selected={outcomeIds}
        onChange={setOutcomeIds}
      />
      <MultiSelect
        label="Supports projects"
        placeholder="Select projects…"
        items={projects}
        selected={projectIds}
        onChange={setProjectIds}
      />

      {error && <p className="error">{error}</p>}

      <div className="actions form-actions">
        {editing && (
          <button type="button" className="ghost danger" style={{ marginRight: 'auto' }} onClick={onDelete}>
            Delete
          </button>
        )}
        <button type="button" className="ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Add insight'}
        </button>
      </div>
    </form>
  );
}

// TIMESTAMPTZ in, yyyy-mm-dd out, which is all a date input accepts.
function asDateInput(value) {
  if (!value) return '';
  return new Date(value).toISOString().slice(0, 10);
}
