import { useEffect, useState } from 'react';
import AutoGrowTextarea from './AutoGrowTextarea.jsx';
import ChildCoverage from './ChildCoverage.jsx';
import TargetsSection from './TargetsSection.jsx';

const EMPTY = { name: '', description: '' };

// Rendered inside the modal, whose breadcrumb sets the parent and supplies the
// heading and close control; `parentFields` holds that parent. `editing` is null
// when creating, or the impact being changed.
export default function ImpactForm({
  editing,
  parentFields,
  targets = [],
  coverageData,
  onAddTarget,
  onEditTarget,
  onDeleteTarget,
  onViewTarget,
  onSubmit,
  onCancel,
  onDelete,
}) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) {
      setForm({
        name: editing.name ?? '',
        description: editing.description ?? '',
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

    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        name: form.name.trim(),
        description: form.description.trim() || null,
        ...parentFields,
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
        <span className="hint">The business result. Put the number in a target below.</span>
      </label>

      <label>
        Description
        <AutoGrowTextarea
          value={form.description}
          placeholder="Why does this matter to the business?"
          onChange={(event) => update('description', event.target.value)}
        />
      </label>

      <TargetsSection
        targets={targets}
        saved={Boolean(editing)}
        onAdd={onAddTarget}
        onEdit={onEditTarget}
        onDelete={onDeleteTarget}
        onView={onViewTarget}
        renderExtra={(target) =>
          editing && <ChildCoverage kind="impact" entity={editing} target={target} collections={coverageData} />
        }
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
        <button type="submit" className="btn-impact" disabled={saving}>
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Add impact'}
        </button>
      </div>
    </form>
  );
}
