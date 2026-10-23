import { useEffect, useState } from 'react';
import { formatValue } from '../lib/links.js';

const EMPTY = {
  name: '',
  description: '',
  unit: '',
  baseline_value: '',
  target_value: '',
  baseline_at: '',
  due_at: '',
};

// A target is an outcome (or an impact) stated as numbers. The API requires a
// unit and both numbers, so all three are enforced here rather than being left
// to the 400. `outcome` is the entity being quantified and `parentKind` says
// whether it is an 'outcome' (default) or an 'impact'.
// `editing` is null when creating, or the target being changed.
export default function TargetForm({ outcome, parentKind = 'outcome', editing, onSubmit, onCancel, onDelete }) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) {
      setForm({
        name: editing.name ?? '',
        description: editing.description ?? '',
        unit: editing.unit ?? '',
        baseline_value: editing.baseline_value ?? '',
        target_value: editing.target_value ?? '',
        baseline_at: asDateInput(editing.baseline_at),
        due_at: asDateInput(editing.due_at),
      });
    } else {
      setForm(EMPTY);
    }
    setError(null);
  }, [editing]);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    if (!form.name.trim()) return setError('Name is required.');
    if (!form.unit.trim()) return setError('Unit is required — a number with no unit counts nothing.');
    for (const [field, label] of [
      ['baseline_value', 'Baseline'],
      ['target_value', 'Target'],
    ]) {
      if (String(form[field]).trim() === '') return setError(`${label} is required.`);
      if (!Number.isFinite(Number(form[field]))) return setError(`${label} must be a number.`);
    }
    if (Number(form.baseline_value) === Number(form.target_value)) {
      return setError('Baseline and target are the same, so the target asks for no change.');
    }

    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        [parentKind === 'impact' ? 'impact_id' : 'outcome_id']: Number(outcome.id),
        name: form.name.trim(),
        description: form.description.trim() || null,
        unit: form.unit.trim(),
        baseline_value: Number(form.baseline_value),
        target_value: Number(form.target_value),
        // date inputs have no zone; both are sent as an explicit instant
        // because the API columns are TIMESTAMPTZ.
        baseline_at: form.baseline_at ? new Date(form.baseline_at).toISOString() : null,
        due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const preview =
    form.baseline_value !== '' && form.target_value !== ''
      ? `${formatValue(form.baseline_value)} → ${formatValue(form.target_value)} ${form.unit.trim() || 'units'}`
      : null;

  return (
    <form className="outcome-form" onSubmit={submit}>
      <p className="empty">
        Quantifying <strong>{outcome.name}</strong>.
      </p>

      <label>
        Name
        <input
          autoFocus
          value={form.name}
          placeholder="e.g. Admins inviting in their first session"
          onChange={(event) => update('name', event.target.value)}
        />
        <span className="hint">What the number counts, not what will be built.</span>
      </label>

      <div className="row">
        <label>
          <span className="label-text">
            Baseline <span className="required">required</span>
          </span>
          <input
            inputMode="decimal"
            value={form.baseline_value}
            placeholder="e.g. 412"
            onChange={(event) => update('baseline_value', event.target.value)}
          />
        </label>

        <label>
          <span className="label-text">
            Target <span className="required">required</span>
          </span>
          <input
            inputMode="decimal"
            value={form.target_value}
            placeholder="e.g. 600"
            onChange={(event) => update('target_value', event.target.value)}
          />
        </label>

        <label>
          <span className="label-text">
            Unit <span className="required">required</span>
          </span>
          <input
            value={form.unit}
            placeholder="admins, percent…"
            onChange={(event) => update('unit', event.target.value)}
          />
        </label>
      </div>

      {preview && <p className="target-preview">{preview}</p>}

      <div className="row">
        <label>
          Baseline read on
          <input
            type="date"
            value={form.baseline_at}
            onChange={(event) => update('baseline_at', event.target.value)}
          />
          <span className="hint">Leave empty to use today.</span>
        </label>

        <label>
          Due by
          <input
            type="date"
            value={form.due_at}
            onChange={(event) => update('due_at', event.target.value)}
          />
          <span className="hint">A target with no date is a wish.</span>
        </label>
      </div>

      <label>
        Description
        <textarea
          rows={2}
          value={form.description}
          placeholder="Where does this number come from?"
          onChange={(event) => update('description', event.target.value)}
        />
      </label>

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
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Add target'}
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
