import { useEffect, useState } from 'react';

const EMPTY = { name: '', description: '', parent_impact_id: '' };

// Rendered inside the modal, which supplies the heading and close control.
// `editing` is null when creating, or the impact being changed; `parent` is the
// impact a new child hangs off, when added from the map.
export default function ImpactForm({ editing, parent, impacts, onSubmit, onCancel, onDelete }) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) {
      setForm({
        name: editing.name ?? '',
        description: editing.description ?? '',
        parent_impact_id: editing.parent_impact_id ? String(editing.parent_impact_id) : '',
      });
    } else {
      setForm({ ...EMPTY, parent_impact_id: parent ? String(parent.id) : '' });
    }
    setError(null);
  }, [editing, parent]);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  // An impact can't sit under itself or anything beneath it.
  const options = impacts.filter((impact) => !isSelfOrDescendant(impact, editing?.id, impacts));

  async function submit(event) {
    event.preventDefault();
    if (!form.name.trim()) return setError('Name is required.');

    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        name: form.name.trim(),
        description: form.description.trim() || null,
        parent_impact_id: form.parent_impact_id ? Number(form.parent_impact_id) : null,
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
        Name
        <input
          autoFocus
          value={form.name}
          placeholder="e.g. Grow revenue"
          onChange={(event) => update('name', event.target.value)}
        />
        <span className="hint">The business result. Put the number in a target.</span>
      </label>

      <label>
        Description
        <textarea
          rows={3}
          value={form.description}
          placeholder="Why does this matter to the business?"
          onChange={(event) => update('description', event.target.value)}
        />
      </label>

      <label>
        Parent impact
        <select
          value={form.parent_impact_id}
          onChange={(event) => update('parent_impact_id', event.target.value)}
        >
          <option value="">None (top-level impact)</option>
          {options.map((impact) => (
            <option key={impact.id} value={impact.id}>
              {impact.name}
            </option>
          ))}
        </select>
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
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Add impact'}
        </button>
      </div>
    </form>
  );
}

function isSelfOrDescendant(candidate, editingId, impacts) {
  if (!editingId) return false;
  let current = candidate;
  const seen = new Set();
  while (current && !seen.has(current.id)) {
    if (String(current.id) === String(editingId)) return true;
    seen.add(current.id);
    current = impacts.find((impact) => impact.id === current.parent_impact_id);
  }
  return false;
}
