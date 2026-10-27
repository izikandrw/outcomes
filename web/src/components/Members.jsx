import { useCallback, useEffect, useState } from 'react';
import * as api from '../api.js';

// Admin-only: list users, remove them, invite more and reset their passwords.
// Invites and resets are single-use links (shown once) for the admin to share.
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
      setLink({
        message: `Share this link with ${created.email}. It works once, expires in 7 days, and won't be shown again.`,
        url: `${window.location.origin}/?invite=${created.token}`,
      });
      setEmail('');
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function resetPassword(user) {
    setError(null);
    try {
      const created = await api.createPasswordReset(accountId, user.id);
      setLink({
        message: `Share this link with ${created.email} so they can choose a new password. It works once, expires in 24 hours, replaces any earlier reset link, and won't be shown again. Their current password keeps working until they use it.`,
        url: `${window.location.origin}/?reset=${created.token}`,
      });
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
            <span className="member-actions">
              <button type="button" className="ghost small" onClick={() => resetPassword(user)}>
                Reset password
              </button>
              {String(user.id) !== String(currentUserId) && (
                <button
                  type="button"
                  className="ghost danger small"
                  onClick={() => run(() => api.deleteUser(accountId, user.id))}
                >
                  Remove
                </button>
              )}
            </span>
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
          <p className="empty">{link.message}</p>
          <input readOnly value={link.url} onFocus={(e) => e.target.select()} />
        </div>
      )}
    </div>
  );
}
