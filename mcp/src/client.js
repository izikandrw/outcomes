// Thin client for the outcomes REST API. The MCP server holds no data logic of
// its own: auth, account scoping and validation all stay in the API.
//
// Config (env):
//   OUTCOMES_API_URL    API origin (default http://localhost:3000)
//   OUTCOMES_API_TOKEN  a session token, or
//   OUTCOMES_EMAIL + OUTCOMES_PASSWORD  to sign in (re-done when a token expires), or
//   OUTCOMES_DEV_LOGIN=true  to use the API's local-only /auth/dev-login
const API_URL = (process.env.OUTCOMES_API_URL || 'http://localhost:3000').replace(/\/$/, '');

let session = process.env.OUTCOMES_API_TOKEN ? { token: process.env.OUTCOMES_API_TOKEN } : null;

async function send(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return { status: 204, data: null };
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

function fail(result) {
  throw new Error(result.data?.error || `request failed (${result.status})`);
}

async function signIn() {
  const { OUTCOMES_EMAIL: email, OUTCOMES_PASSWORD: password, OUTCOMES_DEV_LOGIN } = process.env;
  let result;
  if (email && password) {
    result = await send('/auth/login', { method: 'POST', body: { email, password } });
  } else if (OUTCOMES_DEV_LOGIN === 'true') {
    result = await send('/auth/dev-login', { method: 'POST' });
  } else {
    throw new Error(
      'No credentials: set OUTCOMES_API_TOKEN, or OUTCOMES_EMAIL and OUTCOMES_PASSWORD, or OUTCOMES_DEV_LOGIN=true'
    );
  }
  if (!result.ok) fail(result);
  session = { token: result.data.token, accountId: String(result.data.account.id) };
}

async function ensureSession() {
  if (!session) await signIn();
  if (!session.accountId) {
    const me = await send('/auth/me', { token: session.token });
    if (!me.ok) {
      session = null;
      await signIn();
    } else {
      session.accountId = String(me.data.account.id);
    }
  }
  return session;
}

// Calls a path under the signed-in user's account, e.g. api('/outcomes').
// Signs in again once if the token was rejected.
export async function api(path, options = {}) {
  for (let attempt = 0; ; attempt++) {
    const { token, accountId } = await ensureSession();
    const result = await send(`/accounts/${accountId}${path}`, { ...options, token });
    if (result.status === 401 && attempt === 0) {
      session = null;
      continue;
    }
    if (result.status !== 204 && !result.ok) fail(result);
    return result.data;
  }
}
