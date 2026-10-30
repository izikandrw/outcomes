import { useState } from 'react';
import * as api from '../api.js';
import LogoField from './LogoField.jsx';

// Admin-only: rename the account and set the logo shown in the header, the
// account menu and on invite links.
export default function AccountSettings({ account, onSaved, onCancel }) {
  const [name, setName] = useState(account.name);
  const [logo, setLogo] = useState(account.logo ?? null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (!name.trim()) return setError('Name is required.');
    setSaving(true);
    setError(null);
    try {
      const saved = await api.updateAccount(account.id, { name: name.trim(), logo });
      onSaved({ id: saved.id, name: saved.name, logo: saved.logo });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <form className="outcome-form" onSubmit={submit}>
      <label>
        Account name
        <input autoFocus value={name} onChange={(event) => setName(event.target.value)} />
      </label>

      <LogoField logo={logo} name={name} badgeClassName="account-initial-badge" onChange={setLogo} />

      {error && <p className="error">{error}</p>}

      <div className="actions form-actions">
        <button type="button" className="ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}
