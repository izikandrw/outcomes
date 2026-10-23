import { useState } from 'react';

const LOGO_SIZE = 128;

// Downsizes the picked image to fit LOGO_SIZE and returns it as a PNG data URL,
// so logos stay small enough to store on the team row.
function readLogo(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, LOGO_SIZE / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file could not be read as an image.'));
    };
    image.src = url;
  });
}

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

  async function pickLogo(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    try {
      setLogo(await readLogo(file));
      setError(null);
    } catch (err) {
      setError(err.message);
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

      <div className="logo-field">
        Logo
        <div className="logo-row">
          {logo ? (
            <img className="logo-preview" src={logo} alt="" />
          ) : (
            <span className="logo-preview team-initial-badge">{name.trim().charAt(0).toUpperCase() || '?'}</span>
          )}
          <label className="ghost logo-pick">
            {logo ? 'Change' : 'Upload logo'}
            <input type="file" accept="image/*" hidden onChange={pickLogo} />
          </label>
          {logo && (
            <button type="button" className="ghost" onClick={() => setLogo(null)}>
              Remove
            </button>
          )}
        </div>
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
        <button type="submit" className="btn-team" disabled={saving}>
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Add team'}
        </button>
      </div>
    </form>
  );
}
