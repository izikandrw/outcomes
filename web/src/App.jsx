import { useCallback, useEffect, useState } from 'react';
import * as api from './api.js';
import MeasurementForm from './components/MeasurementForm.jsx';
import Members from './components/Members.jsx';
import Modal from './components/Modal.jsx';
import OutcomeForm from './components/OutcomeForm.jsx';
import ParentOutcomeTag from './components/ParentOutcomeTag.jsx';
import ProjectForm from './components/ProjectForm.jsx';
import TargetForm from './components/TargetForm.jsx';
import OutcomeList from './components/OutcomeList.jsx';
import OutcomeTree from './components/OutcomeTree.jsx';
import ViewToggle from './components/ViewToggle.jsx';
import { PlusIcon } from './components/icons.jsx';
import { targetsForOutcome } from './lib/links.js';

const STORED_VIEW = 'outcomes.view';

export default function App({ user, account, onSignOut }) {
  const accountId = account.id;
  const [teams, setTeams] = useState([]);
  const [projects, setProjects] = useState([]);
  const [outcomes, setOutcomes] = useState([]);
  const [targets, setTargets] = useState([]);
  const [measurements, setMeasurements] = useState([]);
  // null when closed, otherwise { kind, outcome, parent, parentId }: `outcome`
  // is the row being edited, `parent` the outcome a new child hangs off, and
  // `parentId` (for kind 'outcome') the live value of the parent-outcome tag.
  const [modal, setModal] = useState(null);
  const [view, setView] = useState(() => localStorage.getItem(STORED_VIEW) || 'tree');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadAccountData = useCallback(async (id) => {
    if (!id) {
      setTeams([]);
      setProjects([]);
      setOutcomes([]);
      setTargets([]);
      setMeasurements([]);
      return;
    }
    setLoading(true);
    try {
      const [nextTeams, nextProjects, nextOutcomes, nextTargets, nextMeasurements] = await Promise.all([
        api.listTeams(id),
        api.listProjects(id),
        api.listOutcomes(id),
        api.listTargets(id),
        api.listMeasurements(id),
      ]);
      setTeams(nextTeams);
      setProjects(nextProjects);
      setOutcomes(nextOutcomes);
      setTargets(nextTargets);
      setMeasurements(nextMeasurements);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAccountData(accountId);
  }, [accountId, loadAccountData]);

  const openCreate = () => setModal({ kind: 'outcome', outcome: null, parentId: null });
  const openEdit = (outcome) =>
    setModal({ kind: 'outcome', outcome, parentId: outcome.parent_outcome_id ?? null });
  // From the tree's per-node add menu: kind is 'outcome' | 'target' |
  // 'measurement' | 'project'.
  const openAdd = (parent, kind) =>
    setModal({ kind, outcome: null, parent, parentId: kind === 'outcome' ? parent.id : null });
  // A target is always edited in the context of the outcome it quantifies.
  const openEditTarget = (target, outcome) =>
    setModal({ kind: 'target', outcome: null, target, parent: outcome });
  const openEditProject = (project) => setModal({ kind: 'project', project, parent: null });
  const setModalParentId = (parentId) => setModal((current) => (current ? { ...current, parentId } : current));

  function changeView(next) {
    setView(next);
    localStorage.setItem(STORED_VIEW, next);
  }

  async function addTeam(name) {
    const team = await api.createTeam(accountId, name);
    setTeams((current) => [...current, team]);
  }

  // Throws on failure so the form can surface the error and stay open; the
  // modal only closes once the save has actually landed.
  async function saveOutcome(outcome) {
    const editing = modal?.outcome;
    if (editing) {
      const updated = await api.updateOutcome(accountId, editing.id, outcome);
      setOutcomes((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } else {
      const created = await api.createOutcome(accountId, outcome);
      setOutcomes((current) => [...current, created]);
    }
    setModal(null);
  }

  async function saveTarget(target) {
    const editing = modal?.target;
    if (editing) {
      const updated = await api.updateTarget(accountId, editing.id, target);
      setTargets((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } else {
      const created = await api.createTarget(accountId, target);
      setTargets((current) => [...current, created]);
    }
    setModal(null);
  }

  async function saveMeasurement(measurement) {
    const created = await api.createMeasurement(accountId, measurement);
    setMeasurements((current) => [...current, created]);
    // latest_value and measurement_count are derived server-side, so the target
    // rows go stale the moment a reading lands. A failed refresh is not a
    // failed save, so it only leaves progress stale rather than surfacing.
    try {
      setTargets(await api.listTargets(accountId));
    } catch {
      /* empty */
    }
    setModal(null);
  }

  async function removeTarget(target) {
    if (!window.confirm(`Delete target "${target.name}"?`)) return;
    try {
      await api.deleteTarget(accountId, target.id);
      setTargets((current) => current.filter((item) => item.id !== target.id));
      setError(null);
    } catch (err) {
      // 409 when readings still point at it.
      setError(`Could not delete: ${err.message}`);
    }
  }

  async function saveProject(project) {
    const editing = modal?.project;
    if (editing) {
      const updated = await api.updateProject(accountId, editing.id, project);
      setProjects((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } else {
      const created = await api.createProject(accountId, project);
      setProjects((current) => [...current, created]);
    }
    setModal(null);
  }

  async function removeProject(project) {
    if (!window.confirm(`Delete project "${project.name}"?`)) return;
    try {
      await api.deleteProject(accountId, project.id);
      setProjects((current) => current.filter((item) => item.id !== project.id));
      setModal(null);
      setError(null);
    } catch (err) {
      // 409 when a child project or outcome still references it.
      setError(`Could not delete: ${err.message}`);
    }
  }

  async function removeOutcome(outcome) {
    if (!window.confirm(`Delete "${outcome.name}"?`)) return;
    try {
      await api.deleteOutcome(accountId, outcome.id);
      setOutcomes((current) => current.filter((item) => item.id !== outcome.id));
      if (modal?.outcome?.id === outcome.id) setModal(null);
      setError(null);
    } catch (err) {
      // The API returns 409 when child outcomes or targets still point here.
      setError(`Could not delete: ${err.message}`);
    }
  }

  return (
    <div className="app">
      <header>
        <h1>Outcomes</h1>
        <div className="account-bar">
          <span className="account-name">
            {account.name} · {user.email}
          </span>
          {user.role === 'admin' && (
            <button type="button" className="ghost small" onClick={() => setModal({ kind: 'members' })}>
              Members
            </button>
          )}
          <button type="button" className="ghost small" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </header>

      {error && <p className="error banner">{error}</p>}

      {teams.length === 0 && !loading ? (
        <NeedsTeam onCreate={addTeam} />
      ) : (
        <main>
          <section className="card" aria-label="Outcomes">
            <div className="list-head">
              <ViewToggle view={view} onChange={changeView} />
              <button type="button" className="with-icon" onClick={openCreate}>
                <PlusIcon />
                New outcome
              </button>
            </div>
            {loading ? (
              <p className="empty">Loading…</p>
            ) : outcomes.length === 0 ? (
              <EmptyOutcomes onCreate={openCreate} />
            ) : view === 'tree' ? (
              <OutcomeTree
                outcomes={outcomes}
                teams={teams}
                projects={projects}
                targets={targets}
                measurements={measurements}
                onEdit={openEdit}
                onEditProject={openEditProject}
                onAdd={openAdd}
                onDelete={removeOutcome}
                onDeleteProject={removeProject}
              />
            ) : (
              <OutcomeList
                outcomes={outcomes}
                teams={teams}
                projects={projects}
                targets={targets}
                onEdit={openEdit}
                onDelete={removeOutcome}
                onAddTarget={(outcome) => openAdd(outcome, 'target')}
                onEditTarget={openEditTarget}
                onDeleteTarget={removeTarget}
              />
            )}
          </section>
        </main>
      )}

      {modal && (
        <Modal
          title={modalTitle(modal)}
          header={
            modal.kind === 'outcome' ? (
              <ParentOutcomeTag
                outcomes={outcomes}
                editingId={modal.outcome?.id ?? null}
                value={modal.parentId}
                onChange={setModalParentId}
              />
            ) : undefined
          }
          onClose={() => setModal(null)}
        >
          {modal.kind === 'members' ? (
            <Members accountId={accountId} currentUserId={user.id} />
          ) : modal.kind === 'target' ? (
            <TargetForm
              outcome={modal.parent}
              editing={modal.target}
              onSubmit={saveTarget}
              onCancel={() => setModal(null)}
            />
          ) : modal.kind === 'measurement' ? (
            <MeasurementForm
              outcome={modal.parent}
              targets={targetsForOutcome(targets, modal.parent)}
              onSubmit={saveMeasurement}
              onCancel={() => setModal(null)}
              onAddTarget={() => openAdd(modal.parent, 'target')}
            />
          ) : modal.kind === 'project' ? (
            <ProjectForm
              editing={modal.project}
              outcome={modal.parent}
              teams={teams}
              onSubmit={saveProject}
              onCancel={() => setModal(null)}
              onDelete={() => removeProject(modal.project)}
            />
          ) : (
            <OutcomeForm
              editing={modal.outcome}
              parent={modal.parent}
              parentOutcomeId={modal.parentId}
              teams={teams}
              projects={projects}
              onSubmit={saveOutcome}
              onCancel={() => setModal(null)}
            />
          )}
        </Modal>
      )}
    </div>
  );
}

function modalTitle({ kind, outcome, parent, target, project }) {
  if (kind === 'members') return 'Members';
  if (kind === 'target') return target ? `Edit target #${target.id}` : 'New target';
  if (kind === 'measurement') return 'New measurement';
  if (kind === 'project') return project ? `Edit project #${project.id}` : 'New project';
  if (outcome) return `Edit outcome #${outcome.id}`;
  return parent ? 'New child outcome' : 'New outcome';
}

function EmptyOutcomes({ onCreate }) {
  return (
    <div className="empty-state">
      <p className="empty">No outcomes yet.</p>
      <button type="button" className="with-icon" onClick={onCreate}>
        <PlusIcon />
        Add the first one
      </button>
    </div>
  );
}

// Every outcome needs a team_id, so an account with no teams can't get started.
function NeedsTeam({ onCreate }) {
  const [name, setName] = useState('');
  const [error, setError] = useState(null);

  async function submit(event) {
    event.preventDefault();
    if (!name.trim()) return;
    try {
      await onCreate(name.trim());
      setName('');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>Add a team first</h2>
      <p className="empty">Outcomes belong to a team, and this account doesn&apos;t have one yet.</p>
      <div className="inline-form">
        <input
          value={name}
          placeholder="Team name"
          onChange={(event) => setName(event.target.value)}
        />
        <button type="submit">Create team</button>
      </div>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
