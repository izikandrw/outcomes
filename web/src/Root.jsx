import { useEffect, useState } from 'react';
import * as api from './api.js';
import App from './App.jsx';
import AuthScreen from './components/AuthScreen.jsx';

// Owns the session. Shows the sign-in / sign-up / accept-invite screen until
// there is a signed-in user, then hands the account to the workspace.
// An invite link looks like /?invite=<token>, a password reset link like /?reset=<token>,
// and a share link, which signs in straight away, like /?share=<token>.
const inviteToken = () => new URLSearchParams(window.location.search).get('invite');
const resetToken = () => new URLSearchParams(window.location.search).get('reset');
const shareToken = () => new URLSearchParams(window.location.search).get('share');

// Takes the share token out of the address bar, leaving whatever else the link names.
function dropShareToken() {
  const params = new URLSearchParams(window.location.search);
  params.delete('share');
  const search = params.toString();
  window.history.replaceState(null, '', `${window.location.pathname}${search ? `?${search}` : ''}`);
}

export default function Root() {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // In local dev, skip the sign-in screen when the API has DEV_AUTO_LOGIN on.
    const devSignIn = () =>
      import.meta.env.DEV && !inviteToken() && !resetToken()
        ? api.devLogin().then(({ token, user, account }) => {
            api.setToken(token);
            setSession({ user, account });
          })
        : null;
    const openShareLink = (token) =>
      api.openShareLink(token).then(({ token: sessionToken, user, account }) => {
        api.setToken(sessionToken);
        api.setShareToken(token);
        setSession({ user, account });
      });
    // No session to restore: a share link opened here before gets back in without one.
    const withoutSession = () =>
      api.getShareToken() ? openShareLink(api.getShareToken()).catch(devSignIn) : devSignIn();
    const restore = () =>
      api.getToken()
        ? api.getMe().then(setSession).catch(() => {
            api.setToken(null);
            return withoutSession();
          })
        : withoutSession();
    // A reset link always shows the reset screen, even to someone already signed in here.
    const linkToken = shareToken();
    const start = resetToken()
      ? null
      : linkToken
        ? openShareLink(linkToken).catch(restore).finally(dropShareToken)
        : restore();
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
    api.setShareToken(null);
    if (inviteToken() || resetToken()) window.history.replaceState(null, '', window.location.pathname);
    setSession({ user, account });
  }

  function signOut() {
    api.setToken(null);
    api.setShareToken(null);
    setSession(null);
  }

  // The API can take a minute to wake, and someone opening a link shouldn't stare at a blank page.
  if (checking) {
    return shareToken() ? (
      <div className="app auth">
        <p className="empty">Opening the account…</p>
      </div>
    ) : null;
  }
  if (!session) return <AuthScreen inviteToken={inviteToken()} resetToken={resetToken()} onSignedIn={signedIn} />;
  return (
    <App
      key={session.account.id}
      user={session.user}
      account={session.account}
      onAccountChange={(account) => setSession((current) => ({ ...current, account }))}
      onSignOut={signOut}
    />
  );
}
