import { useState } from 'react';
import LogoField from './LogoField.jsx';

// Creates a team or edits one in place. A team can't be moved under itself or
// any of its own descendants, so those are left out of the parent choices.
export default function TeamForm({ editing, parent, teams, onSubmit, onCancel, onDelete }) {
  const [name, setName] = useState(editing?.name ?? '');
  const [parentId, setParentId] = useState(
    editing?.parent_team_id ? String(editing.parent_team_id) : parent ? String(parent.id) : ''
  );
  const [logo, setLogo] = useState(editing?.logo ?? null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const excluded = new Set();
  if (editing) {
    excluded.add(editing.id);
    let grew = true;
    while (grew) {
      grew = false;
      for (const team of teams) {
        if (!excluded.has(team.id) && excluded.has(team.parent_team_id)) {
          excluded.add(team.id);
          grew = true;
        }
      }
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (!name.trim()) return setError('Name is required.');
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ name: name.trim(), parent_team_id: parentId ? Number(parentId) : null, logo });
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
          value={name}
          placeholder="e.g. Onboarding"
          onChange={(event) => setName(event.target.value)}
        />
      </label>

      <label>
        Parent team
        <select value={parentId} onChange={(event) => setParentId(event.target.value)}>
          <option value="">None (top-level team)</option>
          {teams
            .filter((team) => !excluded.has(team.id))
            .map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
        </select>
      </label>

      <LogoField logo={logo} name={name} badgeClassName="team-initial-badge" onChange={setLogo} />

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
        <button type="submit" className="btn-team" disabled={saving}>
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Add team'}
        </button>
      </div>
    </form>
  );
}
