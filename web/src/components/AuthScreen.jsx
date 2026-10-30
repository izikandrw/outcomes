import { useEffect, useState } from 'react';
import * as api from '../api.js';

// Sign in, create a new account, (with an invite token) join an existing one,
// or (with a reset token) choose a new password.
export default function AuthScreen({ inviteToken, resetToken, onSignedIn }) {
  const [mode, setMode] = useState('login');
  const [invite, setInvite] = useState(null);
  const [reset, setReset] = useState(null);
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

  useEffect(() => {
    if (!resetToken) return;
    api
      .getPasswordReset(resetToken)
      .then(setReset)
      .catch((err) => setError(err.message));
  }, [resetToken]);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (resetToken && reset) onSignedIn(await api.resetPassword(resetToken, password));
      else if (inviteToken && invite) onSignedIn(await api.acceptInvite(inviteToken, password));
      else if (mode === 'signup') onSignedIn(await api.signup({ email, password, accountName }));
      else onSignedIn(await api.login(email, password));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const resetting = Boolean(resetToken && reset);
  const joining = !resetToken && Boolean(inviteToken && invite);
  const linkToken = resetToken || inviteToken;
  const linkLoaded = resetToken ? reset : invite;
  const newPassword = resetting || joining || mode === 'signup';
  const title = resetting
    ? 'Choose a new password'
    : joining
      ? `Join ${invite.account_name}`
      : mode === 'signup'
        ? 'Create an account'
        : 'Sign in';

  return (
    <div className="app auth">
      <header>
        <h1>Outcomes</h1>
      </header>
      <form className="card" onSubmit={submit}>
        {joining && invite.account_logo && <img className="auth-account-logo" src={invite.account_logo} alt="" />}
        <h2>{title}</h2>
        {error && <p className="error banner">{error}</p>}
        {resetting || joining ? (
          <p className="empty">Choose a password for {(reset || invite).email}.</p>
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
          {resetting ? 'New password' : 'Password'}
          <input
            type="password"
            autoComplete={newPassword ? 'new-password' : 'current-password'}
            minLength={newPassword ? 8 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <div className="inline-form">
          <button type="submit" disabled={busy || (linkToken && !linkLoaded)}>
            {resetting ? 'Set password' : joining ? 'Join' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </button>
          {!linkToken && (
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
        {mode === 'login' && !linkToken && (
          <p className="empty">Forgot your password? Ask an admin on your account for a reset link.</p>
        )}
      </form>
    </div>
  );
}
