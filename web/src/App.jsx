import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from './api.js';
import ImpactForm from './components/ImpactForm.jsx';
import InsightForm from './components/InsightForm.jsx';
import ConfirmDialog from './components/ConfirmDialog.jsx';
import AccountLogo from './components/AccountLogo.jsx';
import AccountMenu from './components/AccountMenu.jsx';
import AccountSettings from './components/AccountSettings.jsx';
import EntityInsights from './components/EntityInsights.jsx';
import InsightList from './components/InsightList.jsx';
import MeasurementForm from './components/MeasurementForm.jsx';
import Members from './components/Members.jsx';
import Modal from './components/Modal.jsx';
import OutcomeForm from './components/OutcomeForm.jsx';
import ParentOutcomeTag from './components/ParentOutcomeTag.jsx';
import ProjectForm from './components/ProjectForm.jsx';
import TargetMeasurements from './components/TargetMeasurements.jsx';
import TargetForm from './components/TargetForm.jsx';
import TeamForm from './components/TeamForm.jsx';
import TeamHome from './components/TeamHome.jsx';
import TeamTree from './components/TeamTree.jsx';
import OutcomeList from './components/OutcomeList.jsx';
import IssueCounts from './components/IssueCounts.jsx';
import IssueExplainer from './components/IssueExplainer.jsx';
import JumpToTop from './components/JumpToTop.jsx';
import OutcomeTree from './components/OutcomeTree.jsx';
import PotentialIssues from './components/PotentialIssues.jsx';
import ReviewQueue from './components/ReviewQueue.jsx';
import Roadmap from './components/Roadmap.jsx';
import TopNav from './components/TopNav.jsx';
import ViewToggle from './components/ViewToggle.jsx';
import { PlusIcon } from './components/icons.jsx';
import { insightsForOutcome, insightsForProject, isEvidence, targetLabel, targetsFor } from './lib/links.js';

const STORED_VIEW = 'outcomes.view';
const STORED_PAGE = 'outcomes.page';
const STORED_TEAM = 'outcomes.team';

// The fields a project PUT replaces; parent_project_id is sent explicitly so a
// partial update never clears it.
const projectPayload = (project) => ({
  name: project.name,
  description: project.description,
  team_id: project.team_id,
  start_at: project.start_at,
  end_at: project.end_at,
  parent_project_id: project.parent_project_id,
});

const outcomePayload = (outcome) => ({
  name: outcome.name,
  description: outcome.description,
  team_id: outcome.team_id,
  project_id: outcome.project_id,
  parent_outcome_id: outcome.parent_outcome_id,
  impact_id: outcome.impact_id,
});

export default function App({ user, account, onAccountChange, onSignOut }) {
  const accountId = account.id;
  const [teams, setTeams] = useState([]);
  const [projects, setProjects] = useState([]);
  const [impacts, setImpacts] = useState([]);
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
  // Which team the 'team' page shows: that page is a team's home, reached by
  // clicking a team card or a team badge.
  const [teamId, setTeamId] = useState(() => localStorage.getItem(STORED_TEAM));
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  // Once the header scrolls out of view a compact copy of the nav pins to the top.
  const headerRef = useRef(null);
  const [headerHidden, setHeaderHidden] = useState(false);
  // The rule a header issue count was clicked for; Potential Issues scrolls to
  // its section. A fresh object each click, so a repeat click scrolls again.
  const [issueFocus, setIssueFocus] = useState(null);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setHeaderHidden(!entry.isIntersecting));
    observer.observe(headerRef.current);
    return () => observer.disconnect();
  }, []);

  const loadAccountData = useCallback(async (id) => {
    if (!id) {
      setTeams([]);
      setProjects([]);
      setImpacts([]);
      setOutcomes([]);
      setTargets([]);
      setMeasurements([]);
      setInsights([]);
      return;
    }
    setLoading(true);
    try {
      const [
        nextTeams,
        nextProjects,
        nextImpacts,
        nextOutcomes,
        nextTargets,
        nextMeasurements,
        nextInsights,
      ] = await Promise.all([
        api.listTeams(id),
        api.listProjects(id),
        api.listImpacts(id),
        api.listOutcomes(id),
        api.listTargets(id),
        api.listMeasurements(id),
        api.listInsights(id),
      ]);
      setTeams(nextTeams);
      setProjects(nextProjects);
      setImpacts(nextImpacts);
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

  const currentTeam = teams.find((team) => String(team.id) === String(teamId)) ?? null;

  // Every count, badge and issue check reads `evidence`: suggestions from the
  // insight collector don't count until someone approves them. Lists where a
  // person works with insights directly also show suggestions (marked), but
  // never rejected ones.
  const evidence = insights.filter(isEvidence);
  const activeInsights = insights.filter((insight) => insight.status !== 'rejected');
  // Shown beside the evidence count on each card, so waiting suggestions are
  // visible without counting toward anything.
  const suggestions = insights.filter((insight) => insight.status === 'unvalidated');
  const pendingReview = suggestions.length;

  const openCreate = () => setModal({ kind: 'outcome', outcome: null, parentId: null });
  const openEdit = (outcome) =>
    setModal({ kind: 'outcome', outcome, parentId: outcome.parent_outcome_id ?? null });
  const openCreateImpact = () => setModal({ kind: 'impact', impact: null, parent: null });
  const openEditImpact = (impact) => setModal({ kind: 'impact', impact, parent: null });
  // From the tree's per-node add menu: kind is 'outcome' | 'target' |
  // 'project' | 'insight' | 'impact', and parentKind says whether the node it
  // was opened from is an 'outcome' (default) or an 'impact'.
  const openAdd = (parent, kind, parentKind = 'outcome') => {
    if (kind === 'impact') return setModal({ kind: 'impact', impact: null, parent });
    // An outcome added under an impact is top-level and carries the link.
    if (kind === 'outcome' && parentKind === 'impact') {
      return setModal({ kind: 'outcome', outcome: null, parent: null, parentId: null, impactId: parent.id });
    }
    setModal({ kind, outcome: null, parent, parentKind, parentId: kind === 'outcome' ? parent.id : null });
  };
  // A target is always edited in the context of the outcome or impact it quantifies.
  const openEditTarget = (target, parent, parentKind = 'outcome') =>
    setModal({ kind: 'target', outcome: null, target, parent, parentKind });
  const viewTarget = (target) => setModal({ kind: 'target-measurements', target });
  // From a target's measurements: the reading form is for that one target, and
  // `returnTo` brings the user back to the table once it is saved or cancelled.
  const addReading = (target) => {
    const parentKind = target.impact_id != null ? 'impact' : 'outcome';
    const parent =
      parentKind === 'impact'
        ? impacts.find((item) => String(item.id) === String(target.impact_id))
        : outcomes.find((item) => String(item.id) === String(target.outcome_id));
    setModal({ kind: 'measurement', target, parent, parentKind, returnTo: target });
  };
  const showIssue = (rule, entity) => setModal({ kind: 'issue', rule, entity });
  // entity is the outcome or project whose insights to list; kind says which.
  // filter is which badge was clicked: 'verified' or 'suggested'.
  const showInsights = (entity, kind, filter = 'verified') =>
    setModal({ kind: 'entity-insights', entity, entityKind: kind, filter });
  const openEditProject = (project) => setModal({ kind: 'project', project, parent: null });
  const openAddChildProject = (parentProject) =>
    setModal({ kind: 'project', project: null, parent: null, parentProject });
  const setModalParentId = (parentId) => setModal((current) => (current ? { ...current, parentId } : current));

  function changePage(next) {
    setPage(next);
    localStorage.setItem(STORED_PAGE, next);
  }

  function openTeam(id) {
    const value = String(id?.id ?? id);
    setTeamId(value);
    localStorage.setItem(STORED_TEAM, value);
    changePage('team');
  }

  function changeView(next) {
    setView(next);
    localStorage.setItem(STORED_VIEW, next);
  }

  function openIssues(rule) {
    changePage('outcomes');
    changeView('issues');
    setIssueFocus({ ruleId: rule.id });
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
    let saved;
    if (editing) {
      saved = await api.updateOutcome(accountId, editing.id, outcome);
      setOutcomes((current) => current.map((item) => (item.id === saved.id ? saved : item)));
    } else {
      saved = await api.createOutcome(accountId, outcome);
      setOutcomes((current) => [...current, saved]);
    }
    // The form writes the project links, so mirror them onto each project's
    // outcome_ids, which is what the map and lists read.
    const linked = new Set(saved.project_ids.map(String));
    setProjects((current) =>
      current.map((project) => {
        const others = (project.outcome_ids ?? []).filter((id) => String(id) !== String(saved.id));
        return { ...project, outcome_ids: linked.has(String(project.id)) ? [...others, saved.id] : others };
      })
    );
    setModal(null);
    if (!editing && modal?.fromProposal) await linkProposal(modal.fromProposal, 'outcome', saved);
  }

  async function saveImpact(impact) {
    const editing = modal?.impact;
    if (editing) {
      const updated = await api.updateImpact(accountId, editing.id, impact);
      setImpacts((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } else {
      const created = await api.createImpact(accountId, impact);
      setImpacts((current) => [...current, created]);
    }
    setModal(null);
  }

  async function removeImpact(impact) {
    if (!(await askConfirm('Delete impact?', `“${impact.name}” will be permanently deleted.`))) return;
    try {
      await api.deleteImpact(accountId, impact.id);
      setImpacts((current) => current.filter((item) => item.id !== impact.id));
      setModal(null);
      setError(null);
    } catch (err) {
      // 409 when a child impact, outcome or target still points at it.
      setError(`Could not delete: ${err.message}`);
      setModal(null);
    }
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
    closeMeasurement();
  }

  const closeMeasurement = () =>
    setModal(modal?.returnTo ? { kind: 'target-measurements', target: modal.returnTo } : null);

  async function removeTarget(target) {
    if (!(await askConfirm('Delete target?', `“${targetLabel(target)}” will be permanently deleted.`))) return;
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
      sentiment: insight.sentiment,
      team_id: insight.team_id,
      outcome_ids: insight.outcome_ids.map(Number),
      project_ids: insight.project_ids.map(Number),
      ...patch,
    });
    setInsights((current) => current.map((item) => (item.id === updated.id ? updated : item)));
  }

  const replaceInsight = (updated) =>
    setInsights((current) => current.map((item) => (item.id === updated.id ? updated : item)));

  async function approveInsight(insight) {
    replaceInsight(await api.validateInsight(accountId, insight.id));
  }

  async function rejectInsight(insight, reason, note) {
    replaceInsight(await api.rejectInsight(accountId, insight.id, reason, note));
  }

  async function reopenInsight(insight) {
    replaceInsight(await api.reopenInsight(accountId, insight.id));
  }

  // From the review queue: drop one suggested link and keep the rest.
  function unlinkInsight(insight, kind, id) {
    const field = kind === 'project' ? 'project_ids' : 'outcome_ids';
    return patchInsight(insight, {
      [field]: insight[field].filter((linked) => String(linked) !== String(id)).map(Number),
    });
  }

  // From the review queue: the collector proposed an outcome or project that
  // doesn't exist yet. Open its form prefilled; saving it links the insight
  // (see linkProposal).
  function createFromProposal(insight, index) {
    const proposal = insight.proposed_links[index];
    const draft = { name: proposal.name, description: proposal.description ?? '' };
    const fromProposal = { insightId: insight.id, index };
    if (proposal.kind === 'project') {
      setModal({ kind: 'project', project: null, parent: null, draft, fromProposal });
    } else {
      setModal({ kind: 'outcome', outcome: null, parent: null, parentId: null, draft, fromProposal });
    }
  }

  // From the review queue, whether or not the collector proposed anything: the
  // reviewer creates an outcome or project of their own, and saving it links
  // the insight the same way (with no proposal to drop).
  function createForInsight(insight, kind) {
    const fromProposal = { insightId: insight.id, index: null };
    if (kind === 'project') {
      setModal({ kind: 'project', project: null, parent: null, fromProposal });
    } else {
      setModal({ kind: 'outcome', outcome: null, parent: null, parentId: null, fromProposal });
    }
  }

  // Once the proposed outcome or project exists: link the insight to it with
  // the collector's rationale, and drop the proposal. Creating it has already
  // linked every insight awaiting review that proposed the same name (see
  // src/lib/adoptProposals.js), so reload them all first; this one still needs
  // patching only when the reviewer renamed it in the form, or created it
  // without a proposal. The modal has already closed, so a failure here shows
  // on the page rather than inviting a second create.
  async function linkProposal({ insightId, index }, kind, created) {
    const before = insights.find((item) => item.id === insightId);
    if (!before) return;
    const proposal = index == null ? null : before.proposed_links[index];
    const field = kind === 'project' ? 'project_ids' : 'outcome_ids';
    try {
      const fresh = await api.listInsights(accountId);
      setInsights(fresh);
      const insight = fresh.find((item) => item.id === insightId);
      if (insight && !insight[field].map(String).includes(String(created.id))) {
        const rationales = { outcomes: {}, projects: {} };
        if (proposal?.rationale) rationales[kind === 'project' ? 'projects' : 'outcomes'][created.id] = proposal.rationale;
        const remaining = insight.proposed_links.filter(
          (item) => item.kind !== proposal?.kind || item.name !== proposal?.name
        );
        await patchInsight(insight, {
          [field]: [...insight[field].map(Number), Number(created.id)],
          link_rationales: rationales,
          ...(proposal ? { proposed_links: remaining } : {}),
        });
      }
      setError(null);
    } catch (err) {
      setError(`Created “${created.name}” but could not link insight #${insightId} to it: ${err.message}`);
    }
  }

  // From the review queue, in one step: create every outcome and project the
  // collector proposed, link the insight to each with its rationale, then
  // approve it. There is no form to pick a team, so each takes the insight's
  // team, or the only team, or none until someone assigns one. A proposal
  // whose name matches an existing outcome or project links to that instead,
  // so two insights proposing the same missing outcome don't create it twice.
  // Throws so the card can show it.
  async function acceptAllProposals(insight) {
    const teamId = insight.team_id ?? (teams.length === 1 ? teams[0].id : null);
    const sameName = (item, name) => item.name.trim().toLowerCase() === name.trim().toLowerCase();
    const ids = { outcome_ids: insight.outcome_ids.map(Number), project_ids: insight.project_ids.map(Number) };
    const rationales = { outcomes: {}, projects: {} };
    // Tracked locally too, since state from earlier creates in this loop hasn't landed yet.
    const known = { outcome: [...outcomes], project: [...projects] };
    for (const proposal of insight.proposed_links) {
      const isProject = proposal.kind === 'project';
      let target = known[proposal.kind].find((item) => sameName(item, proposal.name));
      if (!target) {
        const fields = {
          name: proposal.name.trim(),
          description: proposal.description?.trim() || null,
          team_id: teamId ? Number(teamId) : null,
        };
        if (isProject) {
          target = await api.createProject(accountId, { ...fields, outcome_ids: [] });
          setProjects((current) => [...current, target]);
        } else {
          target = await api.createOutcome(accountId, { ...fields, project_ids: [] });
          setOutcomes((current) => [...current, target]);
        }
        known[proposal.kind].push(target);
      }
      const field = isProject ? 'project_ids' : 'outcome_ids';
      if (!ids[field].includes(Number(target.id))) ids[field].push(Number(target.id));
      if (proposal.rationale) rationales[isProject ? 'projects' : 'outcomes'][target.id] = proposal.rationale;
    }
    await patchInsight(insight, { ...ids, link_rationales: rationales, proposed_links: [] });
    await approveInsight(insight);
    // The creates also linked other insights awaiting review that proposed
    // the same names (see src/lib/adoptProposals.js).
    setInsights(await api.listInsights(accountId));
  }

  function dismissProposal(insight, index) {
    return patchInsight(insight, { proposed_links: insight.proposed_links.filter((_, i) => i !== index) });
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
      setModal(null);
      if (modal?.fromProposal) await linkProposal(modal.fromProposal, 'project', created);
      return;
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

  // Breaks the link a map line draws: a child outcome loses its parent, a
  // project loses its parent project or one driven outcome.
  async function unlink({ from, to }) {
    const same = (a, b) => String(a) === String(b);
    try {
      if (to.kind === 'outcome') {
        const child = outcomes.find((item) => same(item.id, to.id));
        // Whether its line came from a parent outcome or an impact, both go.
        const updated = await api.updateOutcome(accountId, child.id, {
          ...outcomePayload(child),
          parent_outcome_id: null,
          impact_id: null,
        });
        setOutcomes((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      } else if (from.kind === 'project') {
        const child = projects.find((item) => same(item.id, to.id));
        const updated = await api.updateProject(accountId, child.id, {
          ...projectPayload(child),
          parent_project_id: null,
        });
        setProjects((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      } else {
        const project = projects.find((item) => same(item.id, to.id));
        const outcome = outcomes.find((item) => same(item.id, from.id));
        const updated = await api.updateProject(accountId, project.id, {
          ...projectPayload(project),
          outcome_ids: (project.outcome_ids ?? []).filter((id) => !same(id, outcome.id)).map(Number),
        });
        setProjects((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        // The older single-column link would otherwise keep the line drawn.
        if (same(outcome.project_id, project.id)) {
          const cleared = await api.updateOutcome(accountId, outcome.id, {
            ...outcomePayload(outcome),
            project_id: null,
          });
          setOutcomes((current) => current.map((item) => (item.id === cleared.id ? cleared : item)));
        }
      }
      setError(null);
    } catch (err) {
      setError(`Could not remove link: ${err.message}`);
    }
  }

  // Saves a link dragged between two map nodes (see linkBetween): the child
  // takes the parent as its parent outcome, project or impact, an outcome
  // takes an impact, or a project adds an outcome it drives.
  async function link({ parent, child }) {
    const { data } = child;
    try {
      if (child.type === 'impact') {
        const updated = await api.updateImpact(accountId, data.id, {
          name: data.name,
          description: data.description,
          parent_impact_id: parent.data.id,
        });
        setImpacts((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      } else if (child.type === 'outcome') {
        // Only a top-level outcome carries an impact link.
        const updated = await api.updateOutcome(accountId, data.id, {
          ...outcomePayload(data),
          parent_outcome_id: parent.type === 'outcome' ? parent.data.id : null,
          impact_id: parent.type === 'impact' ? parent.data.id : null,
        });
        setOutcomes((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      } else {
        const updated = await api.updateProject(accountId, data.id, {
          ...projectPayload(data),
          ...(parent.type === 'project'
            ? { parent_project_id: parent.data.id }
            : { outcome_ids: [...(data.outcome_ids ?? []), parent.data.id].map(Number) }),
        });
        setProjects((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      }
      setError(null);
    } catch (err) {
      setError(`Could not link: ${err.message}`);
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
      <header ref={headerRef}>
        <div className="brand">
          {account.logo && <AccountLogo account={account} size={32} />}
          <h1>Outcomes</h1>
        </div>
        <TopNav page={page === 'team' ? 'teams' : page} onChange={changePage} counts={{ review: pendingReview }} />
        <IssueCounts impacts={impacts} outcomes={outcomes} projects={projects} insights={evidence} onOpen={openIssues} />
        <AccountMenu
          user={user}
          account={account}
          onSettings={() => setModal({ kind: 'account' })}
          onMembers={() => setModal({ kind: 'members' })}
          onSignOut={onSignOut}
        />
      </header>

      {headerHidden && (
        <div className="pinned-nav">
          {account.logo && <AccountLogo account={account} size={24} className="pinned-logo" />}
          <TopNav
            page={page === 'team' ? 'teams' : page}
            onChange={(next) => {
              changePage(next);
              window.scrollTo({ top: 0 });
            }}
            counts={{ review: pendingReview }}
          />
          <IssueCounts impacts={impacts} outcomes={outcomes} projects={projects} insights={evidence} onOpen={openIssues} />
        </div>
      )}

      {error && <p className="error banner">{error}</p>}

      <main>
        {page === 'teams' || page === 'team' ? (
          <section className="card" aria-label={currentTeam ? currentTeam.name : 'Teams'}>
            {loading ? (
              <p className="empty">Loading…</p>
            ) : page === 'team' && currentTeam ? (
              <TeamHome
                team={currentTeam}
                teams={teams}
                projects={projects}
                outcomes={outcomes}
                impacts={impacts}
                insights={evidence}
                suggestions={suggestions}
                onBack={() => changePage('teams')}
                onEdit={(team) => setModal({ kind: 'team', team })}
                onOpenTeam={openTeam}
                onOpenProject={openEditProject}
                onOpenOutcome={openEdit}
                onOpenImpact={openEditImpact}
                onShowInsights={showInsights}
              />
            ) : (
              <TeamTree
                teams={teams}
                outcomes={outcomes}
                projects={projects}
                onCreate={() => setModal({ kind: 'team', team: null })}
                onOpenTeam={openTeam}
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
                insights={activeInsights}
                outcomes={outcomes}
                projects={projects}
                teams={teams}
                onCreate={() => setModal({ kind: 'insight', insight: null })}
                onEdit={(insight) => setModal({ kind: 'insight', insight })}
                onDelete={removeInsight}
              />
            )}
          </section>
        ) : page === 'review' ? (
          <section className="card" aria-label="Review insights">
            {loading ? (
              <p className="empty">Loading…</p>
            ) : (
              <ReviewQueue
                accountId={accountId}
                insights={insights}
                outcomes={outcomes}
                projects={projects}
                onApprove={approveInsight}
                onReject={rejectInsight}
                onEdit={(insight) => setModal({ kind: 'insight', insight })}
                onUnlink={unlinkInsight}
                onCreateProposed={createFromProposal}
                onCreateOwn={createForInsight}
                onDismissProposed={dismissProposal}
                onAcceptAll={acceptAllProposals}
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
                insights={evidence}
                suggestions={suggestions}
                onEditProject={openEditProject}
                onShowInsights={showInsights}
                onOpenTeam={openTeam}
              />
            )}
          </section>
        ) : (
        <section className="card" aria-label={page === 'map' ? 'Map' : 'Outcomes'}>
          <div className="list-head">
            {page === 'map' ? <span /> : <ViewToggle view={view === 'issues' ? 'issues' : 'list'} onChange={changeView} />}
            <div className="actions">
              {page === 'map' && (
                <button type="button" className="with-icon btn-impact" onClick={openCreateImpact}>
                  <PlusIcon />
                  New impact
                </button>
              )}
              <button type="button" className="with-icon btn-outcome" onClick={openCreate}>
                <PlusIcon />
                New outcome
              </button>
            </div>
          </div>
          {loading ? (
            <p className="empty">Loading…</p>
          ) : outcomes.length === 0 && !(page === 'map' && impacts.length > 0) ? (
            <EmptyOutcomes onCreate={openCreate} />
          ) : page === 'map' ? (
            <OutcomeTree
              impacts={impacts}
              outcomes={outcomes}
              projects={projects}
              targets={targets}
              insights={evidence}
              suggestions={suggestions}
              onShowInsights={showInsights}
              onEdit={openEdit}
              onEditImpact={openEditImpact}
              onViewTarget={viewTarget}
              onEditProject={openEditProject}
              onAdd={openAdd}
              onAddChildProject={openAddChildProject}
              onUnlink={unlink}
              onLink={link}
              onOpenTeam={openTeam}
              onShowIssue={showIssue}
            />
          ) : view === 'list' ? (
            <OutcomeList
              outcomes={outcomes}
              teams={teams}
              projects={projects}
              targets={targets}
              insights={evidence}
              suggestions={suggestions}
              onShowInsights={showInsights}
              onOpenTeam={openTeam}
              onEdit={openEdit}
              onDelete={removeOutcome}
              onAddTarget={(outcome) => openAdd(outcome, 'target')}
              onEditTarget={openEditTarget}
              onDeleteTarget={removeTarget}
              onViewTarget={viewTarget}
            />
          ) : (
            <PotentialIssues
              impacts={impacts}
              outcomes={outcomes}
              projects={projects}
              teams={teams}
              insights={evidence}
              onEdit={openEdit}
              onEditImpact={openEditImpact}
              onEditProject={openEditProject}
              focus={issueFocus}
            />
          )}
        </section>
        )}
      </main>

      <JumpToTop />

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
          {modal.kind === 'issue' ? (
            <IssueExplainer rule={modal.rule} entity={modal.entity} />
          ) : modal.kind === 'account' ? (
            <AccountSettings
              account={account}
              onSaved={(saved) => {
                onAccountChange(saved);
                setModal(null);
              }}
              onCancel={() => setModal(null)}
            />
          ) : modal.kind === 'members' ? (
            <Members accountId={accountId} currentUserId={user.id} />
          ) : modal.kind === 'entity-insights' ? (
            <EntityInsights
              key={`${modal.entityKind}-${modal.entity.id}-${modal.filter}`}
              entity={modal.entity}
              initialFilter={modal.filter}
              insights={
                modal.entityKind === 'project'
                  ? insightsForProject(activeInsights, modal.entity)
                  : insightsForOutcome(activeInsights, modal.entity)
              }
              onOpen={(insight) => setModal({ kind: 'insight', insight })}
              onUpdate={patchInsight}
              onValidate={approveInsight}
              onReject={rejectInsight}
              onReopen={reopenInsight}
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
          ) : modal.kind === 'impact' ? (
            <ImpactForm
              key={modal.impact?.id ?? 'new'}
              editing={modal.impact}
              parent={modal.parent}
              impacts={impacts}
              targets={modal.impact ? targetsFor(targets, modal.impact, 'impact') : []}
              onAddTarget={() => openAdd(modal.impact, 'target', 'impact')}
              onEditTarget={(target) => openEditTarget(target, modal.impact, 'impact')}
              onDeleteTarget={removeTarget}
              onViewTarget={viewTarget}
              onSubmit={saveImpact}
              onCancel={() => setModal(null)}
              onDelete={() => removeImpact(modal.impact)}
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
          ) : modal.kind === 'target-measurements' ? (
            <TargetMeasurements
              target={targets.find((item) => item.id === modal.target.id) ?? modal.target}
              measurements={measurements}
              onAddReading={addReading}
              onUpdateTarget={async (existing, body) => {
                const updated = await api.updateTarget(accountId, existing.id, body);
                setTargets((current) => current.map((item) => (item.id === updated.id ? updated : item)));
              }}
            />
          ) : modal.kind === 'target' ? (
            <TargetForm
              outcome={modal.parent}
              parentKind={modal.parentKind}
              editing={modal.target}
              onSubmit={saveTarget}
              onCancel={() => setModal(null)}
              onDelete={() => removeTarget(modal.target)}
            />
          ) : modal.kind === 'measurement' ? (
            <MeasurementForm
              outcome={modal.parent}
              targets={
                modal.target ? [modal.target] : targetsFor(targets, modal.parent, modal.parentKind)
              }
              onSubmit={saveMeasurement}
              onCancel={closeMeasurement}
              onAddTarget={() => openAdd(modal.parent, 'target', modal.parentKind)}
            />
          ) : modal.kind === 'project' ? (
            <ProjectForm
              editing={modal.project}
              draft={modal.draft}
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
              draft={modal.draft}
              parent={modal.parent}
              parentOutcomeId={modal.parentId}
              teams={teams}
              outcomes={outcomes}
              projects={projects}
              impacts={impacts}
              impactId={modal.impactId}
              targets={modal.outcome ? targetsFor(targets, modal.outcome, 'outcome') : []}
              onAddTarget={() => openAdd(modal.outcome, 'target', 'outcome')}
              onEditTarget={(target) => openEditTarget(target, modal.outcome, 'outcome')}
              onDeleteTarget={removeTarget}
              onViewTarget={viewTarget}
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

function modalTitle({ kind, rule, outcome, parent, target, project, team, insight, impact, entity }) {
  if (kind === 'account') return 'Account settings';
  if (kind === 'members') return 'Members';
  if (kind === 'issue') return `${rule.emoji} ${rule.title}`;
  if (kind === 'impact') return impact ? `Edit impact #${impact.id}` : parent ? 'New child impact' : 'New impact';
  if (kind === 'entity-insights') return `Insights · ${entity.name}`;
  if (kind === 'insight') return insight ? `Edit insight #${insight.id}` : 'New insight';
  if (kind === 'team') return team ? `Edit team #${team.id}` : 'New team';
  if (kind === 'target') return target ? `Edit target #${target.id}` : 'New target';
  if (kind === 'measurement') return 'New measurement';
  if (kind === 'target-measurements') return targetLabel(target);
  if (kind === 'project') return project ? `Edit project #${project.id}` : 'New project';
  if (outcome) return `Edit outcome #${outcome.id}`;
  return parent ? 'New child outcome' : 'New outcome';
}

function EmptyOutcomes({ onCreate }) {
  return (
    <div className="empty-state">
      <p className="empty">No outcomes yet.</p>
      <button type="button" className="with-icon btn-outcome" onClick={onCreate}>
        <PlusIcon />
        Add the first one
      </button>
    </div>
  );
}
