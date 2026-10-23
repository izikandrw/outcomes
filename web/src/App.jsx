import { useCallback, useEffect, useState } from 'react';
import * as api from './api.js';
import InsightForm from './components/InsightForm.jsx';
import ConfirmDialog from './components/ConfirmDialog.jsx';
import AccountMenu from './components/AccountMenu.jsx';
import EntityInsights from './components/EntityInsights.jsx';
import InsightList from './components/InsightList.jsx';
import MeasurementForm from './components/MeasurementForm.jsx';
import Members from './components/Members.jsx';
import Modal from './components/Modal.jsx';
import OutcomeForm from './components/OutcomeForm.jsx';
import ParentOutcomeTag from './components/ParentOutcomeTag.jsx';
import ProjectForm from './components/ProjectForm.jsx';
import TargetForm from './components/TargetForm.jsx';
import TeamForm from './components/TeamForm.jsx';
import TeamTree from './components/TeamTree.jsx';
import OutcomeList from './components/OutcomeList.jsx';
import OutcomeTree from './components/OutcomeTree.jsx';
import PotentialIssues from './components/PotentialIssues.jsx';
import Roadmap from './components/Roadmap.jsx';
import TopNav from './components/TopNav.jsx';
import ViewToggle from './components/ViewToggle.jsx';
import { PlusIcon } from './components/icons.jsx';
import { insightsForOutcome, insightsForProject, targetsForOutcome } from './lib/links.js';

const STORED_VIEW = 'outcomes.view';
const STORED_PAGE = 'outcomes.page';

export default function App({ user, account, onSignOut }) {
  const accountId = account.id;
  const [teams, setTeams] = useState([]);
  const [projects, setProjects] = useState([]);
  const [outcomes, setOutcomes] = useState([]);
  const [targets, setTargets] = useState([]);
  const [measurements, setMeasurements] = useState([]);
  const [insights, setInsights] = useState([]);
  // null when closed, otherwise { kind, outcome, parent, parentId }: `outcome`
  // is the row being edited, `parent` the outcome a new child hangs off, and
  // `parentId` (for kind 'outcome') the live value of the parent-outcome tag.
  const [modal, setModal] = useState(null);
  // { title, message, resolve } while a delete confirmation is showing.
  const [confirmation, setConfirmation] = useState(null);
  const [view, setView] = useState(() => localStorage.getItem(STORED_VIEW) || 'list');
  const [page, setPage] = useState(() => localStorage.getItem(STORED_PAGE) || 'outcomes');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadAccountData = useCallback(async (id) => {
    if (!id) {
      setTeams([]);
      setProjects([]);
      setOutcomes([]);
      setTargets([]);
      setMeasurements([]);
      setInsights([]);
      return;
    }
    setLoading(true);
    try {
      const [nextTeams, nextProjects, nextOutcomes, nextTargets, nextMeasurements, nextInsights] = await Promise.all([
        api.listTeams(id),
        api.listProjects(id),
        api.listOutcomes(id),
        api.listTargets(id),
        api.listMeasurements(id),
        api.listInsights(id),
      ]);
      setTeams(nextTeams);
      setProjects(nextProjects);
      setOutcomes(nextOutcomes);
      setTargets(nextTargets);
      setMeasurements(nextMeasurements);
      setInsights(nextInsights);
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
  // 'project' | 'insight'.
  const openAdd = (parent, kind) =>
    setModal({ kind, outcome: null, parent, parentId: kind === 'outcome' ? parent.id : null });
  // A target is always edited in the context of the outcome it quantifies.
  const openEditTarget = (target, outcome) =>
    setModal({ kind: 'target', outcome: null, target, parent: outcome });
  // A measurement is added against one specific target, from that target's node.
  const openAddMeasurement = (target, outcome) =>
    setModal({ kind: 'measurement', outcome: null, parent: outcome, target });
  // entity is the outcome or project whose insights to list; kind says which.
  const showInsights = (entity, kind) => setModal({ kind: 'entity-insights', entity, entityKind: kind });
  const openEditProject = (project) => setModal({ kind: 'project', project, parent: null });
  const openAddChildProject = (parentProject) =>
    setModal({ kind: 'project', project: null, parent: null, parentProject });
  const setModalParentId = (parentId) => setModal((current) => (current ? { ...current, parentId } : current));

  function changePage(next) {
    setPage(next);
    localStorage.setItem(STORED_PAGE, next);
  }

  function changeView(next) {
    setView(next);
    localStorage.setItem(STORED_VIEW, next);
  }

  async function addTeam(name) {
    const team = await api.createTeam(accountId, { name });
    setTeams((current) => [...current, team]);
  }

  async function saveTeam(team) {
    const editing = modal?.team;
    if (editing) {
      const updated = await api.updateTeam(accountId, editing.id, team);
      setTeams((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } else {
      const created = await api.createTeam(accountId, team);
      setTeams((current) => [...current, created]);
    }
    setModal(null);
  }

  const askConfirm = (title, message) =>
    new Promise((resolve) => setConfirmation({ title, message, resolve }));

  function settleConfirm(answer) {
    confirmation.resolve(answer);
    setConfirmation(null);
  }

  async function removeTeam(team) {
    if (!(await askConfirm('Delete team?', `“${team.name}” will be permanently deleted.`))) return;
    try {
      await api.deleteTeam(accountId, team.id);
      setTeams((current) => current.filter((item) => item.id !== team.id));
      setModal(null);
      setError(null);
    } catch (err) {
      // 409 when a child team, outcome or project still belongs to it.
      setError(`Could not delete: ${err.message}`);
      setModal(null);
    }
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
    if (!(await askConfirm('Delete target?', `“${target.name}” will be permanently deleted.`))) return;
    try {
      await api.deleteTarget(accountId, target.id);
      setTargets((current) => current.filter((item) => item.id !== target.id));
      if (modal?.target?.id === target.id) setModal(null);
      setError(null);
    } catch (err) {
      // 409 when readings still point at it.
      setError(`Could not delete: ${err.message}`);
    }
  }

  async function saveInsight(insight) {
    const editing = modal?.insight;
    if (editing) {
      const updated = await api.updateInsight(accountId, editing.id, insight);
      setInsights((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } else {
      const created = await api.createInsight(accountId, insight);
      setInsights((current) => [...current, created]);
    }
    setModal(null);
  }

  // Inline edit of one field from a table; the PUT replaces the whole insight,
  // so send the rest of it back unchanged. Throws so the cell can show the error.
  async function patchInsight(insight, patch) {
    const updated = await api.updateInsight(accountId, insight.id, {
      name: insight.name,
      type: insight.type,
      description: insight.description,
      source: insight.source,
      observed_at: insight.observed_at,
      dollar_impact: insight.dollar_impact,
      impact_area: insight.impact_area,
      team_id: insight.team_id,
      outcome_ids: insight.outcome_ids.map(Number),
      project_ids: insight.project_ids.map(Number),
      ...patch,
    });
    setInsights((current) => current.map((item) => (item.id === updated.id ? updated : item)));
  }

  async function removeInsight(insight) {
    if (!(await askConfirm('Delete insight?', `“${insight.name}” will be permanently deleted.`))) return;
    try {
      await api.deleteInsight(accountId, insight.id);
      setInsights((current) => current.filter((item) => item.id !== insight.id));
      setModal(null);
      setError(null);
    } catch (err) {
      setError(`Could not delete: ${err.message}`);
      setModal(null);
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
    if (!(await askConfirm('Delete project?', `“${project.name}” will be permanently deleted.`))) return;
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
    if (!(await askConfirm('Delete outcome?', `“${outcome.name}” will be permanently deleted.`))) return;
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
        <TopNav page={page} onChange={changePage} />
        <AccountMenu
          user={user}
          account={account}
          onMembers={() => setModal({ kind: 'members' })}
          onSignOut={onSignOut}
        />
      </header>

      {error && <p className="error banner">{error}</p>}

      {teams.length === 0 && !loading ? (
        <NeedsTeam onCreate={addTeam} />
      ) : (
        <main>
          {page === 'teams' ? (
            <section className="card" aria-label="Teams">
              {loading ? (
                <p className="empty">Loading…</p>
              ) : (
                <TeamTree
                  teams={teams}
                  outcomes={outcomes}
                  projects={projects}
                  onCreate={() => setModal({ kind: 'team', team: null })}
                  onEdit={(team) => setModal({ kind: 'team', team })}
                  onAddChild={(parent) => setModal({ kind: 'team', team: null, parent })}
                  onOpenOutcome={openEdit}
                  onOpenProject={openEditProject}
                />
              )}
            </section>
          ) : page === 'insights' ? (
            <section className="card" aria-label="Insights">
              {loading ? (
                <p className="empty">Loading…</p>
              ) : (
                <InsightList
                  insights={insights}
                  onCreate={() => setModal({ kind: 'insight', insight: null })}
                  onEdit={(insight) => setModal({ kind: 'insight', insight })}
                  onDelete={removeInsight}
                />
              )}
            </section>
          ) : page === 'roadmap' ? (
            <section className="card" aria-label="Roadmap">
              {loading ? (
                <p className="empty">Loading…</p>
              ) : (
                <Roadmap
                  projects={projects}
                  outcomes={outcomes}
                  teams={teams}
                  insights={insights}
                  onEditProject={openEditProject}
                  onShowInsights={showInsights}
                />
              )}
            </section>
          ) : (
          <section className="card" aria-label={page === 'map' ? 'Map' : 'Outcomes'}>
            <div className="list-head">
              {page === 'map' ? <span /> : <ViewToggle view={view === 'issues' ? 'issues' : 'list'} onChange={changeView} />}
              <button type="button" className="with-icon" onClick={openCreate}>
                <PlusIcon />
                New outcome
              </button>
            </div>
            {loading ? (
              <p className="empty">Loading…</p>
            ) : outcomes.length === 0 ? (
              <EmptyOutcomes onCreate={openCreate} />
            ) : page === 'map' ? (
              <OutcomeTree
                outcomes={outcomes}
                teams={teams}
                projects={projects}
                targets={targets}
                measurements={measurements}
                insights={insights}
                onShowInsights={showInsights}
                onEdit={openEdit}
                onEditProject={openEditProject}
                onEditTarget={openEditTarget}
                onAddMeasurement={openAddMeasurement}
                onAdd={openAdd}
                onAddChildProject={openAddChildProject}
              />
            ) : view === 'list' ? (
              <OutcomeList
                outcomes={outcomes}
                teams={teams}
                projects={projects}
                targets={targets}
                insights={insights}
                onShowInsights={showInsights}
                onEdit={openEdit}
                onDelete={removeOutcome}
                onAddTarget={(outcome) => openAdd(outcome, 'target')}
                onEditTarget={openEditTarget}
                onDeleteTarget={removeTarget}
              />
            ) : (
              <PotentialIssues outcomes={outcomes} projects={projects} teams={teams} onEdit={openEdit} />
            )}
          </section>
          )}
        </main>
      )}

      {modal && (
        <Modal
          title={modalTitle(modal)}
          wide={modal.kind === 'entity-insights'}
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
          ) : modal.kind === 'entity-insights' ? (
            <EntityInsights
              entity={modal.entity}
              insights={
                modal.entityKind === 'project'
                  ? insightsForProject(insights, modal.entity)
                  : insightsForOutcome(insights, modal.entity)
              }
              onOpen={(insight) => setModal({ kind: 'insight', insight })}
              onUpdate={patchInsight}
              onAdd={() =>
                setModal({
                  kind: 'insight',
                  insight: null,
                  parent: modal.entityKind === 'outcome' ? modal.entity : null,
                  parentProject: modal.entityKind === 'project' ? modal.entity : null,
                })
              }
            />
          ) : modal.kind === 'insight' ? (
            <InsightForm
              key={modal.insight?.id ?? 'new'}
              editing={modal.insight}
              outcome={modal.parent}
              project={modal.parentProject}
              teams={teams}
              outcomes={outcomes}
              projects={projects}
              onSubmit={saveInsight}
              onCancel={() => setModal(null)}
              onDelete={() => removeInsight(modal.insight)}
            />
          ) : modal.kind === 'team' ? (
            <TeamForm
              key={modal.team?.id ?? 'new'}
              editing={modal.team}
              parent={modal.parent}
              teams={teams}
              onSubmit={saveTeam}
              onCancel={() => setModal(null)}
              onDelete={() => removeTeam(modal.team)}
            />
          ) : modal.kind === 'target' ? (
            <TargetForm
              outcome={modal.parent}
              editing={modal.target}
              onSubmit={saveTarget}
              onCancel={() => setModal(null)}
              onDelete={() => removeTarget(modal.target)}
            />
          ) : modal.kind === 'measurement' ? (
            <MeasurementForm
              outcome={modal.parent}
              targets={modal.target ? [modal.target] : targetsForOutcome(targets, modal.parent)}
              onSubmit={saveMeasurement}
              onCancel={() => setModal(null)}
              onAddTarget={() => openAdd(modal.parent, 'target')}
            />
          ) : modal.kind === 'project' ? (
            <ProjectForm
              editing={modal.project}
              outcome={modal.parent}
              parentProject={modal.parentProject}
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
              onDelete={() => removeOutcome(modal.outcome)}
            />
          )}
        </Modal>
      )}

      {confirmation && (
        <ConfirmDialog
          title={confirmation.title}
          message={confirmation.message}
          onConfirm={() => settleConfirm(true)}
          onCancel={() => settleConfirm(false)}
        />
      )}
    </div>
  );
}

function modalTitle({ kind, outcome, parent, target, project, team, insight, entity }) {
  if (kind === 'members') return 'Members';
  if (kind === 'entity-insights') return `Insights · ${entity.name}`;
  if (kind === 'insight') return insight ? `Edit insight #${insight.id}` : 'New insight';
  if (kind === 'team') return team ? `Edit team #${team.id}` : 'New team';
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
