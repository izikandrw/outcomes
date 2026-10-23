import { useEffect, useState } from 'react';

const EMPTY = {
  name: '',
  description: '',
  team_id: '',
  project_id: '',
};

// Rendered inside the modal, which supplies the heading and close control —
// the parent outcome is set via the clickable tag in the modal header, so
// this form only owns the remaining fields.
// `editing` is null when creating, or the outcome being changed.
export default function OutcomeForm({
  editing,
  parent,
  parentOutcomeId,
  teams,
  projects,
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
        team_id: editing.team_id ?? '',
        project_id: editing.project_id ?? '',
      });
    } else {
      // Adding a child from the tree: inherit the parent's team.
      setForm((current) => ({
        ...EMPTY,
        team_id: parent?.team_id ? String(parent.team_id) : current.team_id,
      }));
    }
    setError(null);
  }, [editing, parent]);

  // Default to the only team so the common single-team case needs no picking.
  useEffect(() => {
    if (!form.team_id && teams.length === 1) {
      setForm((current) => ({ ...current, team_id: String(teams[0].id) }));
    }
  }, [teams, form.team_id]);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    if (!form.name.trim()) return setError('Name is required.');
    if (!form.team_id) return setError('Pick a team — the API requires one.');

    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        name: form.name.trim(),
        description: form.description.trim() || null,
        team_id: Number(form.team_id),
        project_id: form.project_id ? Number(form.project_id) : null,
        parent_outcome_id: parentOutcomeId ? Number(parentOutcomeId) : null,
      });
      if (!editing) setForm((current) => ({ ...EMPTY, team_id: current.team_id }));
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
          placeholder="e.g. Cut onboarding time to under a day"
          onChange={(event) => update('name', event.target.value)}
        />
      </label>

      <label>
        Description
        <textarea
          rows={3}
          value={form.description}
          placeholder="What does success look like?"
          onChange={(event) => update('description', event.target.value)}
        />
      </label>

      <div className="row">
        <label>
          <span className="label-text">
            Team <span className="required">required</span>
          </span>
          <select value={form.team_id} onChange={(event) => update('team_id', event.target.value)}>
            <option value="">Select a team…</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Project
          <select
            value={form.project_id}
            onChange={(event) => update('project_id', event.target.value)}
          >
            <option value="">None</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
      </div>

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
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Add outcome'}
        </button>
      </div>
    </form>
  );
}
