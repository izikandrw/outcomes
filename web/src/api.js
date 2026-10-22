// Thin wrapper over the outcomes API. Every resource below /accounts/:id is
// scoped server-side to the signed-in user's account, so each call takes that
// accountId. In dev this is empty and Vite proxies /auth and /accounts to the local API; in prod
// it's set to the deployed API's origin, since the frontend and API are on
// different domains (Vercel + Render).
const API_URL = import.meta.env.VITE_API_URL || '';

const STORED_TOKEN = 'outcomes.token';
export const getToken = () => localStorage.getItem(STORED_TOKEN);
export const setToken = (token) =>
  token ? localStorage.setItem(STORED_TOKEN, token) : localStorage.removeItem(STORED_TOKEN);

// Fired when the API rejects our token, so the app can drop back to sign-in.
export const UNAUTHORIZED_EVENT = 'outcomes:unauthorized';

async function request(path, options = {}) {
  const token = getToken();
  const headers = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (res.status === 401 && token) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));

  if (res.status === 204) return null;

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(body?.error || `request failed (${res.status})`);
  }
  return body;
}

const json = (method, body) => ({ method, body: JSON.stringify(body) });

export const getMe = () => request('/auth/me');
export const login = (email, password) => request('/auth/login', json('POST', { email, password }));
export const signup = (body) => request('/auth/signup', json('POST', body));
export const getInvite = (token) => request(`/auth/invites/${token}`);
export const acceptInvite = (token, password) =>
  request(`/auth/invites/${token}/accept`, json('POST', { password }));

export const listUsers = (accountId) => request(`/accounts/${accountId}/users`);
export const deleteUser = (accountId, userId) =>
  request(`/accounts/${accountId}/users/${userId}`, { method: 'DELETE' });
export const listInvites = (accountId) => request(`/accounts/${accountId}/invites`);
export const createInvite = (accountId, email, role) =>
  request(`/accounts/${accountId}/invites`, json('POST', { email, role }));
export const deleteInvite = (accountId, inviteId) =>
  request(`/accounts/${accountId}/invites/${inviteId}`, { method: 'DELETE' });

export const listTeams = (accountId) => request(`/accounts/${accountId}/teams`);
export const createTeam = (accountId, team) =>
  request(`/accounts/${accountId}/teams`, { method: 'POST', body: JSON.stringify(team) });
export const updateTeam = (accountId, teamId, team) =>
  request(`/accounts/${accountId}/teams/${teamId}`, { method: 'PUT', body: JSON.stringify(team) });
export const deleteTeam = (accountId, teamId) =>
  request(`/accounts/${accountId}/teams/${teamId}`, { method: 'DELETE' });

export const listProjects = (accountId) => request(`/accounts/${accountId}/projects`);
// outcome_ids writes the project_outcomes links in the same transaction, so a
// project can be created already attached to the outcome it supports.
export const createProject = (accountId, project) =>
  request(`/accounts/${accountId}/projects`, { method: 'POST', body: JSON.stringify(project) });
export const updateProject = (accountId, projectId, project) =>
  request(`/accounts/${accountId}/projects/${projectId}`, {
    method: 'PUT',
    body: JSON.stringify(project),
  });
export const deleteProject = (accountId, projectId) =>
  request(`/accounts/${accountId}/projects/${projectId}`, { method: 'DELETE' });

// Targets come back with latest_value, latest_measured_at and measurement_count
// already joined on, so progress renders without loading the whole series.
export const listTargets = (accountId) => request(`/accounts/${accountId}/targets`);
export const createTarget = (accountId, target) =>
  request(`/accounts/${accountId}/targets`, { method: 'POST', body: JSON.stringify(target) });
export const updateTarget = (accountId, targetId, target) =>
  request(`/accounts/${accountId}/targets/${targetId}`, {
    method: 'PUT',
    body: JSON.stringify(target),
  });
export const deleteTarget = (accountId, targetId) =>
  request(`/accounts/${accountId}/targets/${targetId}`, { method: 'DELETE' });

export const listMeasurements = (accountId) => request(`/accounts/${accountId}/measurements`);
export const createMeasurement = (accountId, measurement) =>
  request(`/accounts/${accountId}/measurements`, {
    method: 'POST',
    body: JSON.stringify(measurement),
  });

export const listOutcomes = (accountId) => request(`/accounts/${accountId}/outcomes`);
export const createOutcome = (accountId, outcome) =>
  request(`/accounts/${accountId}/outcomes`, { method: 'POST', body: JSON.stringify(outcome) });
export const updateOutcome = (accountId, outcomeId, outcome) =>
  request(`/accounts/${accountId}/outcomes/${outcomeId}`, {
    method: 'PUT',
    body: JSON.stringify(outcome),
  });
export const deleteOutcome = (accountId, outcomeId) =>
  request(`/accounts/${accountId}/outcomes/${outcomeId}`, { method: 'DELETE' });
