import { useState } from 'react';
import LogoField from './LogoField.jsx';

// Creates a team or edits one in place. Its parent is set in the modal's
// breadcrumb and arrives as `parentFields`.
export default function TeamForm({ editing, parentFields, onSubmit, onCancel, onDelete }) {
  const [name, setName] = useState(editing?.name ?? '');
  const [logo, setLogo] = useState(editing?.logo ?? null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (!name.trim()) return setError('Name is required.');
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ name: name.trim(), ...parentFields, logo });
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
