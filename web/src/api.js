// Thin wrapper over the outcomes API. Every resource below /accounts/:id is
// account-scoped server-side, so each call takes the selected accountId.
async function request(path, options = {}) {
  const res = await fetch(path, {
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    ...options,
  });

  if (res.status === 204) return null;

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(body?.error || `request failed (${res.status})`);
  }
  return body;
}

export const listAccounts = () => request('/accounts');
export const createAccount = (name) =>
  request('/accounts', { method: 'POST', body: JSON.stringify({ name }) });

export const listTeams = (accountId) => request(`/accounts/${accountId}/teams`);
export const createTeam = (accountId, name) =>
  request(`/accounts/${accountId}/teams`, { method: 'POST', body: JSON.stringify({ name }) });

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
