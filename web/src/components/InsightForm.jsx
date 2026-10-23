import { useState } from 'react';
import { INSIGHT_TYPES } from '../lib/links.js';

// Creates an insight or edits one in place. Evidence is linked to the outcomes
// and projects it supports from here (a new insight started from an outcome
// arrives already linked to it), since an insight is reusable across both.
export default function InsightForm({ editing, outcome, project, teams, outcomes, projects, onSubmit, onCancel, onDelete }) {
  const [form, setForm] = useState({
    name: editing?.name ?? '',
    type: editing?.type ?? 'interview',
    description: editing?.description ?? '',
    source: editing?.source ?? '',
    observed_at: asDateInput(editing?.observed_at),
    dollar_impact: editing?.dollar_impact ?? '',
    team_id: editing?.team_id ? String(editing.team_id) : '',
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
        team_id: form.team_id ? Number(form.team_id) : null,
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
          Observed on
          <input
            type="date"
            value={form.observed_at}
            onChange={(event) => update('observed_at', event.target.value)}
          />
        </label>
      </div>

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

      <label>
        Recorded by
        <select value={form.team_id} onChange={(event) => update('team_id', event.target.value)}>
          <option value="">No team</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
      </label>

      <LinkPicker legend="Supports outcomes" items={outcomes} selected={outcomeIds} onChange={setOutcomeIds} />
      <LinkPicker legend="Supports projects" items={projects} selected={projectIds} onChange={setProjectIds} />

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

function LinkPicker({ legend, items, selected, onChange }) {
  function toggle(id) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  }

  return (
    <fieldset className="link-picker">
      <legend>{legend}</legend>
      {items.length === 0 ? (
        <span className="hint">None yet.</span>
      ) : (
        items.map((item) => (
          <label key={item.id} className="check">
            <input
              type="checkbox"
              checked={selected.has(String(item.id))}
              onChange={() => toggle(String(item.id))}
            />
            {item.name}
          </label>
        ))
      )}
    </fieldset>
  );
}

// TIMESTAMPTZ in, yyyy-mm-dd out, which is all a date input accepts.
function asDateInput(value) {
  if (!value) return '';
  return new Date(value).toISOString().slice(0, 10);
}
