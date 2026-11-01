import { useEffect, useState } from 'react';

const EMPTY = { name: '', description: '', team_id: '', start_at: '', end_at: '' };

// Creates a project already linked to the outcome it is meant to drive (when
// `outcome` is given) or nested under another project (when `parentProject` is
// given), or with neither (from the review queue, where it is linked to an
// insight instead), or edits an existing one in place (when `editing` is
// given). The team
// defaults to the parent's on create, since that is nearly always the same team,
// and may be left empty when it isn't known yet.
// `draft` prefills name and description when creating one the insight
// collector proposed.
export default function ProjectForm({ editing, draft, outcome, parentProject, teams, onSubmit, onCancel, onDelete }) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const defaultTeam = parentProject ?? outcome;

  useEffect(() => {
    if (editing) {
      setForm({
        name: editing.name ?? '',
        description: editing.description ?? '',
        team_id: editing.team_id ? String(editing.team_id) : '',
        start_at: asDateInput(editing.start_at),
        end_at: asDateInput(editing.end_at),
      });
    } else {
      setForm({
        ...EMPTY,
        name: draft?.name ?? '',
        description: draft?.description ?? '',
        team_id: defaultTeam?.team_id
          ? String(defaultTeam.team_id)
          : teams.length === 1
            ? String(teams[0].id)
            : '',
      });
    }
    setError(null);
    // teams is left out on purpose: a refetch mid-edit shouldn't reset the pick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, draft, defaultTeam]);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    if (!form.name.trim()) return setError('Name is required.');
    if (form.start_at && form.end_at && form.end_at < form.start_at) {
      return setError('The end date cannot be before the start date.');
    }

    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        name: form.name.trim(),
        description: form.description.trim() || null,
        team_id: form.team_id ? Number(form.team_id) : null,
        start_at: form.start_at ? new Date(form.start_at).toISOString() : null,
        end_at: form.end_at ? new Date(form.end_at).toISOString() : null,
        ...(editing
          ? {}
          : parentProject
            ? { parent_project_id: parentProject.id, outcome_ids: [] }
            : { outcome_ids: outcome ? [outcome.id] : [] }),
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="outcome-form" onSubmit={submit}>
      {!editing && (
        <p className="empty">
          {parentProject ? (
            <>
              This project will be nested under <strong>{parentProject.name}</strong>.
            </>
          ) : outcome ? (
            <>
              This project will be linked to <strong>{outcome.name}</strong>.
            </>
          ) : (
            'This project will start without a parent outcome or project; you can link one later.'
          )}
        </p>
      )}

      <label>
        Name
        <input
          autoFocus
          value={form.name}
          placeholder="e.g. Rebuild the SSO setup step"
          onChange={(event) => update('name', event.target.value)}
        />
      </label>

      <label>
        Description
        <textarea
          rows={3}
          value={form.description}
          placeholder="What will this ship?"
          onChange={(event) => update('description', event.target.value)}
        />
      </label>

      <label>
        Team
        <select value={form.team_id} onChange={(event) => update('team_id', event.target.value)}>
          <option value="">No team yet</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
      </label>

      <div className="row">
        <label>
          Start date
          <input
            type="date"
            value={form.start_at}
            onChange={(event) => update('start_at', event.target.value)}
          />
        </label>
        <label>
          End date
          <input
            type="date"
            value={form.end_at}
            onChange={(event) => update('end_at', event.target.value)}
          />
        </label>
      </div>
      <span className="hint">Places the project on the roadmap. Leave empty if unscheduled.</span>

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
        <button type="submit" className="btn-project" disabled={saving}>
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Add project'}
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
