import { useCallback, useEffect, useState } from 'react';
import * as api from '../api.js';

// Admin-only: list users, remove them, and invite more by generating a
// single-use link (shown once) for the admin to share.
export default function Members({ accountId, currentUserId }) {
  const [users, setUsers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [link, setLink] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const [nextUsers, nextInvites] = await Promise.all([api.listUsers(accountId), api.listInvites(accountId)]);
      setUsers(nextUsers);
      setInvites(nextInvites);
    } catch (err) {
      setError(err.message);
    }
  }, [accountId]);

  useEffect(() => {
    load();
  }, [load]);

  async function invite(event) {
    event.preventDefault();
    setError(null);
    try {
      const created = await api.createInvite(accountId, email.trim(), role);
      setLink({ email: created.email, url: `${window.location.origin}/?invite=${created.token}` });
      setEmail('');
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function run(action) {
    setError(null);
    try {
      await action();
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="members">
      {error && <p className="error banner">{error}</p>}
      <ul className="member-list">
        {users.map((user) => (
          <li key={user.id}>
            <span>
              {user.email} <small>{user.role}</small>
            </span>
            {String(user.id) !== String(currentUserId) && (
              <button
                type="button"
                className="ghost danger small"
                onClick={() => run(() => api.deleteUser(accountId, user.id))}
              >
                Remove
              </button>
            )}
          </li>
        ))}
        {invites.map((item) => (
          <li key={`invite-${item.id}`}>
            <span>
              {item.email} <small>invited as {item.role}</small>
            </span>
            <button
              type="button"
              className="ghost danger small"
              onClick={() => run(() => api.deleteInvite(accountId, item.id))}
            >
              Revoke
            </button>
          </li>
        ))}
      </ul>

      <form className="inline-form" onSubmit={invite}>
        <input
          type="email"
          placeholder="Email to invite"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role" style={{ width: 'auto' }}>
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </select>
        <button type="submit">Invite</button>
      </form>

      {link && (
        <div className="invite-link">
          <p className="empty">
            Share this link with {link.email}. It works once, expires in 7 days, and won&apos;t be shown again.
          </p>
          <input readOnly value={link.url} onFocus={(e) => e.target.select()} />
        </div>
      )}
    </div>
  );
}
