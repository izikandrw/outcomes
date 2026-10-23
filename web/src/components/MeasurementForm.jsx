import { useEffect, useState } from 'react';
import { targetRange } from '../lib/links.js';

// A measurement is a reading against one target: a value and when it applies,
// which is not necessarily when it was entered. The unit is not asked for —
// it belongs to the target, so every reading in a series counts the same thing.
export default function MeasurementForm({ outcome, targets, onSubmit, onCancel, onAddTarget }) {
  const [form, setForm] = useState({ target_id: '', value: '', measured_at: '' });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  // With one target there is nothing to choose, so it is picked already.
  useEffect(() => {
    if (!form.target_id && targets.length === 1) {
      setForm((current) => ({ ...current, target_id: String(targets[0].id) }));
    }
  }, [targets, form.target_id]);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  const selected = targets.find((target) => String(target.id) === String(form.target_id)) ?? null;

  async function submit(event) {
    event.preventDefault();
    if (!form.target_id) return setError('Pick the target this reading is against.');
    if (form.value.trim() === '') return setError('Value is required.');
    if (Number.isNaN(Number(form.value))) return setError('Value must be a number.');

    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        target_id: Number(form.target_id),
        value: Number(form.value),
        // datetime-local has no zone; the API stores TIMESTAMPTZ, so it is sent
        // as an explicit instant rather than a bare local string.
        measured_at: form.measured_at ? new Date(form.measured_at).toISOString() : null,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // Readings hang off targets, so an outcome with none has nowhere to put one.
  if (targets.length === 0) {
    return (
      <div className="outcome-form">
        <p className="empty">
          <strong>{outcome.name}</strong> has no targets yet, and a reading needs one to say what it
          is counting and what it is counting toward.
        </p>
        <div className="actions form-actions">
          <button type="button" className="ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" onClick={onAddTarget}>
            Add a target first
          </button>
        </div>
      </div>
    );
  }

  return (
    <form className="outcome-form" onSubmit={submit}>
      <p className="empty">
        Recording a reading on <strong>{outcome.name}</strong>.
      </p>

      <label>
        <span className="label-text">
          Target <span className="required">required</span>
        </span>
        <select
          value={form.target_id}
          onChange={(event) => update('target_id', event.target.value)}
        >
          <option value="">Select a target…</option>
          {targets.map((target) => (
            <option key={target.id} value={target.id}>
              {target.name ? `${target.name} (${targetRange(target)})` : targetRange(target)}
            </option>
          ))}
        </select>
      </label>

      <div className="row">
        <label>
          <span className="label-text">
            Value <span className="required">required</span>
          </span>
          <input
            autoFocus
            inputMode="decimal"
            value={form.value}
            placeholder="e.g. 412"
            onChange={(event) => update('value', event.target.value)}
          />
          {selected && <span className="hint">Counted in {selected.unit}.</span>}
        </label>

        <label>
          Measured at
          <input
            type="datetime-local"
            value={form.measured_at}
            onChange={(event) => update('measured_at', event.target.value)}
          />
          <span className="hint">Leave empty to record it as now.</span>
        </label>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="actions form-actions">
        <button type="button" className="ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Add measurement'}
        </button>
      </div>
    </form>
  );
}
