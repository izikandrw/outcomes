import { useEffect, useState } from 'react';
import * as api from './api.js';
import App from './App.jsx';
import AuthScreen from './components/AuthScreen.jsx';

// Owns the session. Shows the sign-in / sign-up / accept-invite screen until
// there is a signed-in user, then hands the account to the workspace.
// An invite link looks like /?invite=<token>.
const inviteToken = () => new URLSearchParams(window.location.search).get('invite');

export default function Root() {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // In local dev, skip the sign-in screen when the API has DEV_AUTO_LOGIN on.
    const devSignIn = () =>
      import.meta.env.DEV && !inviteToken()
        ? api.devLogin().then(({ token, user, account }) => {
            api.setToken(token);
            setSession({ user, account });
          })
        : null;
    const start = api.getToken()
      ? api.getMe().then(setSession).catch(() => {
          api.setToken(null);
          return devSignIn();
        })
      : devSignIn();
    Promise.resolve(start)
      .catch(() => {})
      .finally(() => setChecking(false));
  }, []);

  useEffect(() => {
    const onUnauthorized = () => {
      api.setToken(null);
      setSession(null);
    };
    window.addEventListener(api.UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(api.UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  function signedIn({ token, user, account }) {
    api.setToken(token);
    if (inviteToken()) window.history.replaceState(null, '', window.location.pathname);
    setSession({ user, account });
  }

  function signOut() {
    api.setToken(null);
    setSession(null);
  }

  if (checking) return null;
  if (!session) return <AuthScreen inviteToken={inviteToken()} onSignedIn={signedIn} />;
  return <App key={session.account.id} user={session.user} account={session.account} onSignOut={signOut} />;
}
