import { useState } from 'react';

export default function AccountBar({ accounts, accountId, onSelect, onCreate }) {
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);

  async function submit(event) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    await onCreate(trimmed);
    setName('');
    setAdding(false);
  }

  return (
    <div className="account-bar">
      <label htmlFor="account">Account</label>
      <select
        id="account"
        value={accountId ?? ''}
        onChange={(event) => onSelect(event.target.value || null)}
      >
        <option value="">Select an account…</option>
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.name}
          </option>
        ))}
      </select>

      {adding ? (
        <form className="inline-form" onSubmit={submit}>
          <input
            autoFocus
            value={name}
            placeholder="New account name"
            onChange={(event) => setName(event.target.value)}
          />
          <button type="submit">Create</button>
          <button type="button" className="ghost" onClick={() => setAdding(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <button type="button" className="ghost" onClick={() => setAdding(true)}>
          + New account
        </button>
      )}
    </div>
  );
}
