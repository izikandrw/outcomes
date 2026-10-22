import { useEffect, useState } from 'react';
import * as api from '../api.js';

// Sign in, create a new account, or (with an invite token) join an existing one.
export default function AuthScreen({ inviteToken, onSignedIn }) {
  const [mode, setMode] = useState('login');
  const [invite, setInvite] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accountName, setAccountName] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!inviteToken) return;
    api
      .getInvite(inviteToken)
      .then(setInvite)
      .catch((err) => setError(err.message));
  }, [inviteToken]);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (inviteToken && invite) onSignedIn(await api.acceptInvite(inviteToken, password));
      else if (mode === 'signup') onSignedIn(await api.signup({ email, password, accountName }));
      else onSignedIn(await api.login(email, password));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const joining = Boolean(inviteToken && invite);
  const title = joining ? `Join ${invite.account_name}` : mode === 'signup' ? 'Create an account' : 'Sign in';

  return (
    <div className="app auth">
      <header>
        <h1>Outcomes</h1>
      </header>
      <form className="card" onSubmit={submit}>
        <h2>{title}</h2>
        {error && <p className="error banner">{error}</p>}
        {joining ? (
          <p className="empty">Choose a password for {invite.email}.</p>
        ) : (
          <>
            {mode === 'signup' && (
              <label>
                Account name
                <input value={accountName} onChange={(e) => setAccountName(e.target.value)} required />
              </label>
            )}
            <label>
              Email
              <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
          </>
        )}
        <label>
          Password
          <input
            type="password"
            autoComplete={mode === 'login' && !joining ? 'current-password' : 'new-password'}
            minLength={joining || mode === 'signup' ? 8 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <div className="inline-form">
          <button type="submit" disabled={busy || (inviteToken && !invite)}>
            {joining ? 'Join' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </button>
          {!inviteToken && (
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setMode(mode === 'login' ? 'signup' : 'login');
                setError(null);
              }}
            >
              {mode === 'login' ? 'Create an account' : 'Have an account? Sign in'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
