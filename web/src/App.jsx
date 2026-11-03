import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from './api.js';
import ImpactForm from './components/ImpactForm.jsx';
import ImpactList from './components/ImpactList.jsx';
import CommandPalette, { CommandPaletteButton } from './components/CommandPalette.jsx';
import ConfirmDialog from './components/ConfirmDialog.jsx';
import AccountLogo from './components/AccountLogo.jsx';
import AccountMenu from './components/AccountMenu.jsx';
import AccountSettings from './components/AccountSettings.jsx';
import EntityInsights from './components/EntityInsights.jsx';
import InsightList from './components/InsightList.jsx';
import MeasurementForm from './components/MeasurementForm.jsx';
import Members from './components/Members.jsx';
import Modal from './components/Modal.jsx';
import SidePanel from './components/SidePanel.jsx';
import OutcomeForm from './components/OutcomeForm.jsx';
import CopyLinkLabel from './components/CopyLinkLabel.jsx';
import HierarchyBreadcrumb from './components/HierarchyBreadcrumb.jsx';
import { ancestorMoves, modalHierarchy, parentFields, refKey } from './lib/hierarchy.js';
import ProjectForm from './components/ProjectForm.jsx';
import ProjectList from './components/ProjectList.jsx';
import TargetMeasurements, { formatMeasuredAt } from './components/TargetMeasurements.jsx';
import TargetForm from './components/TargetForm.jsx';
import TeamForm from './components/TeamForm.jsx';
import TeamHome from './components/TeamHome.jsx';
import TeamTree from './components/TeamTree.jsx';
import OutcomeList from './components/OutcomeList.jsx';
import IssueCounts, { IssueFilter } from './components/IssueCounts.jsx';
import IssueExplainer from './components/IssueExplainer.jsx';
import JumpToTop from './components/JumpToTop.jsx';
import OutcomeTree from './components/OutcomeTree.jsx';
import ReviewQueue from './components/ReviewQueue.jsx';
import Roadmap from './components/Roadmap.jsx';
import TopNav from './components/TopNav.jsx';
import { PlusIcon } from './components/icons.jsx';
import { formatValue, insightsForOutcome, insightsForProject, isEvidence, targetLabel, targetsFor } from './lib/links.js';
import { buildSearch, emptyPageView, itemOfModal, readUrl, shareSearchOfModal } from './lib/urlState.js';
import { flaggedBy, ruleById, validateTree } from './lib/validation.js';

const STORED_PAGE = 'outcomes.page';
const STORED_TEAM = 'outcomes.team';
// Where a header issue count takes you, by the kind of thing its rule applies to.
const ISSUE_PAGES = { impact: 'impacts', outcome: 'outcomes', project: 'projects' };

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
  // null when closed, otherwise { kind, outcome, parent, parentId, moves }:
  // `outcome` is the row being edited, `parent` the outcome a new child hangs
  // off, `parentId` (for kind 'outcome') the parent it starts with, and `moves`
  // the breadcrumb's unsaved parent swaps (see lib/hierarchy.js).
  const [modal, setModal] = useState(null);
  // { title, message, resolve } while a delete confirmation is showing.
  const [confirmation, setConfirmation] = useState(null);
  // The view the address bar names when the app opens (see urlState.js); a
  // bare URL falls back to the page and team last used here.
  const [initialUrl] = useState(() => readUrl());
  const [page, setPage] = useState(() => initialUrl.page || localStorage.getItem(STORED_PAGE) || 'outcomes');
  // Which team the 'team' page shows: that page is a team's home, reached by
  // clicking a team card or a team badge.
  const [teamId, setTeamId] = useState(() => initialUrl.teamId || localStorage.getItem(STORED_TEAM));
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  // Once the header scrolls out of view a compact copy of the nav pins to the top.
  const headerRef = useRef(null);
  const [headerHidden, setHeaderHidden] = useState(false);
  // The id of the delivery rule a header issue count was clicked for. The list
  // of the kind of thing it applies to shows only what breaks it, until the
  // filter is cleared or the person moves to another page.
  const [issueFilter, setIssueFilter] = useState(() => (ruleById(initialUrl.issue) ? initialUrl.issue : null));
  // What the page shows within itself (a list's search, filters and sort; the
  // review tab and open run; a team home's subteams toggle), held here so it
  // can live in the URL. A new page starts with an empty one.
  const [pageView, setPageView] = useState(initialUrl.pageView);
  // An item a link names ({ kind, id }), opened once the data it needs has
  // loaded. It stays in the URL until then.
  const [pendingItem, setPendingItem] = useState(initialUrl.item);
  // The insight a link named, outlined on the Insights page; insights edit in
  // place there rather than opening over the page.
  const [focusInsightId, setFocusInsightId] = useState(null);
  const [paletteOpen, setPaletteOpen] = useState(false);

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
    // Insights are added in place, in the list of the outcome's own.
    if (kind === 'insight') {
      return setModal({ kind: 'entity-insights', entity: parent, entityKind: parentKind, filter: 'all', adding: true });
    }
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
  const openCreateProject = () => setModal({ kind: 'project', project: null, parent: null });
  const openAddChildProject = (parentProject) =>
    setModal({ kind: 'project', project: null, parent: null, parentProject });
  const moveInBreadcrumb = (child, parent) =>
    setModal((current) => current && { ...current, moves: { ...current.moves, [refKey(child)]: parent } });

  // A breadcrumb's way back up the tree. Anything unsaved in the open form goes,
  // as it does when another card is clicked.
  function openAncestor({ kind, id }) {
    const item = hierarchyItems[kind].find((row) => String(row.id) === String(id));
    if (!item) return;
    if (kind === 'outcome') openEdit(item);
    else if (kind === 'impact') openEditImpact(item);
    else if (kind === 'project') openEditProject(item);
    else if (kind === 'target') viewTarget(item);
    else setModal({ kind: 'team', team: item });
  }

  function changePage(next) {
    setPage(next);
    setIssueFilter(null);
    setFocusInsightId(null);
    if (next !== page) {
      setPageView(emptyPageView());
      // The side panel leaves the nav clickable, and it belongs to the map.
      setModal(null);
    }
  }

  function openTeam(id) {
    setTeamId(String(id?.id ?? id));
    changePage('team');
  }

  // Keep the address bar in step with the view. Moving to another page, team,
  // tab or run adds a history entry, so Back returns to it; opening an item or
  // changing a list's search or filters rewrites the current one.
  const openItem = itemOfModal(modal);
  const shownItem =
    openItem ??
    pendingItem ??
    (page === 'insights' && focusInsightId != null ? { kind: 'insight', id: String(focusInsightId) } : null);
  const search = buildSearch({ page, teamId, issue: issueFilter, item: shownItem, pageView });
  useEffect(() => {
    localStorage.setItem(STORED_PAGE, page);
    if (teamId) localStorage.setItem(STORED_TEAM, teamId);
    if (search === window.location.search) return;
    const current = readUrl();
    const moved =
      current.page != null &&
      (current.page !== page ||
        (page === 'team' && current.teamId !== teamId) ||
        current.pageView.tab !== pageView.tab ||
        current.pageView.run !== pageView.run);
    window.history[moved ? 'pushState' : 'replaceState'](null, '', `${window.location.pathname}${search}`);
  }, [search, page, teamId, pageView.tab, pageView.run]);

  // Back and Forward: show whatever view the URL now names.
  useEffect(() => {
    const onPopState = () => {
      const next = readUrl();
      setPage(next.page || 'outcomes');
      if (next.teamId) setTeamId(next.teamId);
      setIssueFilter(ruleById(next.issue) ? next.issue : null);
      setPageView(next.pageView);
      setModal(null);
      setFocusInsightId(null);
      setPendingItem(next.item);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Open the item a link names once everything has loaded.
  useEffect(() => {
    if (!pendingItem || loading) return;
    const { kind, id } = pendingItem;
    const collection = { outcome: outcomes, impact: impacts, project: projects, target: targets, insight: insights }[kind];
    const item = collection.find((entry) => String(entry.id) === String(id));
    setPendingItem(null);
    if (!item) return setError(`There is no ${kind} #${id} in this account.`);
    if (kind === 'outcome') openEdit(item);
    else if (kind === 'impact') openEditImpact(item);
    else if (kind === 'project') openEditProject(item);
    else if (kind === 'target') viewTarget(item);
    else {
      if (page !== 'insights') changePage('insights');
      setFocusInsightId(item.id);
    }
    // The open* helpers are recreated each render; the item only needs opening once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingItem, loading, outcomes, impacts, projects, targets, insights]);

  function openIssues(rule) {
    changePage(ISSUE_PAGES[rule.appliesTo]);
    setIssueFilter(rule.id);
    window.scrollTo({ top: 0 });
  }

  // Where the command palette's pick goes (see lib/commandPalette.js). An item
  // opens as a link to it would, over the page you are on.
  function jumpTo(entry) {
    setPaletteOpen(false);
    if (entry.modal) return setModal({ kind: entry.modal });
    if (entry.page || entry.kind === 'team') {
      if (entry.page) {
        changePage(entry.page);
        setPageView((current) => ({ ...current, tab: entry.tab ?? null, run: null }));
      } else {
        openTeam(entry.id);
      }
      window.scrollTo({ top: 0 });
      return;
    }
    if (entry.kind === 'insight' && page === 'insights') {
      // The list's own search or filters could be hiding it.
      setPageView(emptyPageView());
      // Already the focused one, so nothing will scroll back to it by itself.
      if (String(focusInsightId) === entry.id) {
        document.getElementById(`insight-${entry.id}`)?.scrollIntoView({ block: 'center' });
      }
    }
    setPendingItem({ kind: entry.kind, id: entry.id });
  }

  const inSidePanel = page === 'map' && modal != null && opensFromCard(modal);
  const ModalSurface = inSidePanel ? SidePanel : Modal;
  const hierarchyItems = { impact: impacts, outcome: outcomes, project: projects, team: teams, target: targets };
  const modalView = modal && `${modal.kind}-${(modal[modal.kind] ?? modal.target)?.id ?? 'new'}`;
  const hierarchy = modalHierarchy(modal);
  const shareSearch = modal && shareSearchOfModal(modal, { page, teamId });
  const modalHeading =
    modal && (shareSearch ? <CopyLinkLabel label={modalTitle(modal)} search={shareSearch} /> : modalTitle(modal));

  // Swaps made further up the breadcrumb change those items, not the one open,
  // so each save writes them first. A failure throws to the form like any other,
  // and retrying skips what already landed.
  async function saveAncestorMoves() {
    const writes = {
      impact: { update: api.updateImpact, set: setImpacts, payload: ({ name, description }) => ({ name, description }) },
      outcome: { update: api.updateOutcome, set: setOutcomes, payload: outcomePayload },
      project: { update: api.updateProject, set: setProjects, payload: projectPayload },
      team: { update: api.updateTeam, set: setTeams, payload: ({ name, logo }) => ({ name, logo }) },
    };
    for (const { child, parent } of ancestorMoves(hierarchy.start, hierarchyItems, hierarchy.moves)) {
      const { update, set, payload } = writes[child.kind];
      const item = hierarchyItems[child.kind].find((row) => String(row.id) === String(child.id));
      const updated = await update(accountId, child.id, { ...payload(item), ...parentFields(child.kind, parent) });
      set((current) => current.map((row) => (row.id === updated.id ? updated : row)));
    }
  }

  const issueRule = issueFilter ? ruleById(issueFilter) : null;
  const flagged = issueRule ? flaggedBy(issueRule, { impacts, outcomes, projects, insights: evidence }) : null;
  const issueBanner = (all) =>
    issueRule && (
      <IssueFilter rule={issueRule} shown={flagged.length} total={all.length} onClear={() => setIssueFilter(null)} />
    );

  async function saveTeam(team) {
    await saveAncestorMoves();
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
    await saveAncestorMoves();
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
    await saveAncestorMoves();
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
    await refreshTargets();
    closeMeasurement();
  }

  // Stays on the readings table, so the rest of the series can be checked or
  // cleared. A failed delete throws for the table to show beside the row.
  async function removeMeasurement(target, reading) {
    const description = `${formatValue(reading.value)} ${target.unit} on ${formatMeasuredAt(reading.measured_at)}`;
    if (!(await askConfirm('Delete reading?', `The reading of ${description} will be permanently deleted.`))) return;
    await api.deleteMeasurement(accountId, reading.id);
    setMeasurements((current) => current.filter((item) => item.id !== reading.id));
    await refreshTargets();
  }

  // latest_value and measurement_count are derived server-side, so the target
  // rows go stale the moment a reading changes. A failed refresh is not a failed
  // save, so it only leaves progress stale rather than surfacing.
  async function refreshTargets() {
    try {
      setTargets(await api.listTargets(accountId));
    } catch {
      /* empty */
    }
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

  // A new insight from just its observation; the rest is filled in on its card.
  async function createInsight(fields) {
    const created = await api.createInsight(accountId, {
      type: 'interview',
      outcome_ids: [],
      project_ids: [],
      ...fields,
    });
    setInsights((current) => [...current, created]);
    return created;
  }

  // Inline edit of one field from a table; the PUT replaces the whole insight,
  // so send the rest of it back unchanged. Throws so the cell can show the error.
  // The patch shows at once; if the save fails, the fields go back to what they
  // were, unless a later edit has changed them since.
  async function patchInsight(insight, patch) {
    const previous = Object.fromEntries(Object.keys(patch).map((key) => [key, insight[key]]));
    setInsights((current) => current.map((item) => (item.id === insight.id ? { ...item, ...patch } : item)));
    let updated;
    try {
      updated = await api.updateInsight(accountId, insight.id, {
        name: insight.name,
        type: insight.type,
        description: insight.description,
        source: insight.source,
        observed_at: insight.observed_at,
        dollar_impact: insight.dollar_impact,
        impact_area: insight.impact_area,
        sentiment: insight.sentiment,
        outcome_ids: insight.outcome_ids.map(Number),
        project_ids: insight.project_ids.map(Number),
        ...patch,
      });
    } catch (err) {
      setInsights((current) =>
        current.map((item) =>
          item.id === insight.id && Object.keys(patch).every((key) => sameValue(item[key], patch[key]))
            ? { ...item, ...previous }
            : item,
        ),
      );
      throw err;
    }
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
  // approve it. There is no form to pick a team, so each takes the only team,
  // or none until someone assigns one. A proposal
  // whose name matches an existing outcome or project links to that instead,
  // so two insights proposing the same missing outcome don't create it twice.
  // Throws so the card can show it.
  async function acceptAllProposals(insight) {
    const teamId = teams.length === 1 ? teams[0].id : null;
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
      setError(null);
    } catch (err) {
      setError(`Could not delete: ${err.message}`);
      setModal(null);
    }
  }

  async function saveProject(project) {
    await saveAncestorMoves();
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

  // A field edited in place on a project row; throws so the row can show why.
  async function patchProject(project, patch) {
    const updated = await api.updateProject(accountId, project.id, { ...projectPayload(project), ...patch });
    setProjects((current) => current.map((item) => (item.id === updated.id ? updated : item)));
  }

  // Ticks or unticks an outcome the project drives. Unticking also clears the
  // older single-column link (outcome.project_id), which would otherwise keep it linked.
  async function toggleProjectOutcome(project, outcome) {
    const same = (a, b) => String(a) === String(b);
    const ids = (project.outcome_ids ?? []).map(Number);
    const linked = ids.some((id) => same(id, outcome.id)) || same(outcome.project_id, project.id);
    await patchProject(project, {
      outcome_ids: linked ? ids.filter((id) => !same(id, outcome.id)) : [...ids, Number(outcome.id)],
    });
    if (linked && same(outcome.project_id, project.id)) {
      const cleared = await api.updateOutcome(accountId, outcome.id, { ...outcomePayload(outcome), project_id: null });
      setOutcomes((current) => current.map((item) => (item.id === cleared.id ? cleared : item)));
    }
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
    // An open form holds the links as they were, and saving would restore them.
    setModal(null);
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
    setModal(null);
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
        <IssueCounts
          impacts={impacts}
          outcomes={outcomes}
          projects={projects}
          insights={evidence}
          activeId={issueFilter}
          onOpen={openIssues}
        />
        <CommandPaletteButton onClick={() => setPaletteOpen(true)} />
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
          <IssueCounts
            impacts={impacts}
            outcomes={outcomes}
            projects={projects}
            insights={evidence}
            activeId={issueFilter}
            onOpen={openIssues}
          />
          <CommandPaletteButton onClick={() => setPaletteOpen(true)} />
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
                includeSubteams={pageView.subteams}
                onIncludeSubteamsChange={(subteams) => setPageView((current) => ({ ...current, subteams }))}
                view={pageView}
                onViewChange={setPageView}
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
                onUpdateProject={patchProject}
                onToggleProjectOutcome={toggleProjectOutcome}
                onDeleteProject={removeProject}
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
                view={pageView}
                onViewChange={setPageView}
                insights={activeInsights}
                outcomes={outcomes}
                projects={projects}
                focusId={focusInsightId}
                onCreate={createInsight}
                onUpdate={patchInsight}
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
                view={pageView}
                onViewChange={setPageView}
                accountId={accountId}
                insights={insights}
                outcomes={outcomes}
                projects={projects}
                onApprove={approveInsight}
                onReject={rejectInsight}
                onUpdate={patchInsight}
                onUnlink={unlinkInsight}
                onCreateProposed={createFromProposal}
                onCreateOwn={createForInsight}
                onDismissProposed={dismissProposal}
                onAcceptAll={acceptAllProposals}
              />
            )}
          </section>
        ) : page === 'impacts' ? (
          <section className="card" aria-label="Impacts">
            {/* The impact list carries New impact in its own toolbar. */}
            {(loading || impacts.length === 0 || flagged?.length === 0) && (
              <div className="list-head">
                <div className="actions">
                  <button type="button" className="with-icon btn-impact" onClick={openCreateImpact}>
                    <PlusIcon />
                    New impact
                  </button>
                </div>
              </div>
            )}
            {!loading && issueBanner(impacts)}
            {loading ? (
              <p className="empty">Loading…</p>
            ) : impacts.length === 0 ? (
              <p className="empty">No impacts yet.</p>
            ) : flagged?.length === 0 ? null : (
              <ImpactList
                view={pageView}
                onViewChange={setPageView}
                impacts={flagged ?? impacts}
                allImpacts={impacts}
                outcomes={outcomes}
                teams={teams}
                projects={projects}
                targets={targets}
                insights={evidence}
                suggestions={suggestions}
                issues={validateTree({ outcomes, projects, insights: evidence, impacts }).impact}
                onCreate={openCreateImpact}
                onEdit={openEditImpact}
                onDelete={removeImpact}
                onAddTarget={(impact) => openAdd(impact, 'target', 'impact')}
                onEditTarget={openEditTarget}
                onDeleteTarget={removeTarget}
                onViewTarget={viewTarget}
              />
            )}
          </section>
        ) : page === 'projects' ? (
          <section className="card" aria-label="Projects">
            {/* The project list carries New project in its own toolbar. */}
            {(loading || projects.length === 0 || flagged?.length === 0) && (
              <div className="list-head">
                <div className="actions">
                  <button type="button" className="with-icon btn-project" onClick={openCreateProject}>
                    <PlusIcon />
                    New project
                  </button>
                </div>
              </div>
            )}
            {!loading && issueBanner(projects)}
            {loading ? (
              <p className="empty">Loading…</p>
            ) : projects.length === 0 ? (
              <p className="empty">No projects yet.</p>
            ) : flagged?.length === 0 ? null : (
              <ProjectList
                view={pageView}
                onViewChange={setPageView}
                projects={flagged ?? projects}
                allProjects={projects}
                outcomes={outcomes}
                teams={teams}
                impacts={impacts}
                insights={evidence}
                suggestions={suggestions}
                issues={validateTree({ outcomes, projects, insights: evidence, impacts }).project}
                onCreate={openCreateProject}
                onUpdate={patchProject}
                onToggleOutcome={toggleProjectOutcome}
                onDelete={removeProject}
                onShowInsights={showInsights}
                onOpenTeam={openTeam}
              />
            )}
          </section>
        ) : page === 'roadmap' ? (
          <section className="card" aria-label="Roadmap">
            {!loading && issueBanner(projects)}
            {loading ? (
              <p className="empty">Loading…</p>
            ) : flagged?.length === 0 ? null : (
              <Roadmap
                projects={flagged ?? projects}
                allProjects={projects}
                outcomes={outcomes}
                teams={teams}
                insights={evidence}
                suggestions={suggestions}
                onUpdateProject={patchProject}
                onToggleProjectOutcome={toggleProjectOutcome}
                onDeleteProject={removeProject}
                onShowInsights={showInsights}
                onOpenTeam={openTeam}
                view={pageView}
                onViewChange={setPageView}
                completionsByDefault={!issueRule}
              />
            )}
          </section>
        ) : (
        <section className="card" aria-label={page === 'map' ? 'Map' : 'Outcomes'}>
          {/* The outcome list carries New outcome in its own toolbar. */}
          {(page === 'map' || loading || outcomes.length === 0 || flagged?.length === 0) && (
            <div className="list-head">
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
          )}
          {!loading && issueBanner(page === 'map' ? impacts : outcomes)}
          {loading ? (
            <p className="empty">Loading…</p>
          ) : outcomes.length === 0 && !(page === 'map' && impacts.length > 0) ? (
            <EmptyOutcomes onCreate={openCreate} />
          ) : flagged?.length === 0 ? null : page === 'map' ? (
            // Filtered to impacts with an issue, the map draws just those impacts.
            <OutcomeTree
              impacts={flagged ?? impacts}
              allImpacts={impacts}
              outcomes={flagged ? [] : outcomes}
              projects={flagged ? [] : projects}
              targets={targets}
              insights={evidence}
              suggestions={flagged ? [] : suggestions}
              onShowInsights={showInsights}
              selectedKey={inSidePanel && openItem ? `${openItem.kind}-${openItem.id}` : null}
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
              onOpenSuggested={() => {
                changePage('review');
                window.scrollTo({ top: 0 });
              }}
            />
          ) : (
            <OutcomeList
              view={pageView}
              onViewChange={setPageView}
              outcomes={flagged ?? outcomes}
              teams={teams}
              projects={projects}
              impacts={impacts}
              targets={targets}
              insights={evidence}
              suggestions={suggestions}
              issues={validateTree({ outcomes, projects, insights: evidence, impacts }).outcome}
              onCreate={openCreate}
              onShowInsights={showInsights}
              onOpenTeam={openTeam}
              onEdit={openEdit}
              onDelete={removeOutcome}
              onAddTarget={(outcome) => openAdd(outcome, 'target')}
              onEditTarget={openEditTarget}
              onDeleteTarget={removeTarget}
              onViewTarget={viewTarget}
            />
          )}
        </section>
        )}
      </main>

      <JumpToTop />

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        data={{ teams, impacts, outcomes, projects, targets, insights }}
        loading={loading}
        onGo={jumpTo}
      />

      {modal && (
        <ModalSurface
          // One card replacing another starts fresh: its own values, at the top.
          key={inSidePanel ? modalView : 'modal'}
          view={modalView}
          title={modalTitle(modal)}
          wide={modal.kind === 'entity-insights'}
          header={
            hierarchy ? (
              <HierarchyBreadcrumb
                heading={modalHeading}
                start={hierarchy.start}
                collections={hierarchyItems}
                moves={hierarchy.moves}
                onMove={hierarchy.editable ? moveInBreadcrumb : undefined}
                onOpen={openAncestor}
              />
            ) : (
              <h2>{modalHeading}</h2>
            )
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
              entityKind={modal.entityKind}
              outcomes={outcomes}
              projects={projects}
              initialFilter={modal.filter}
              startAdding={modal.adding}
              insights={
                // A suggested one from the map: the insights awaiting review that proposed it.
                modal.entity.suggested
                  ? activeInsights.filter((insight) => modal.entity.insight_ids.some((id) => String(id) === String(insight.id)))
                  : modal.entityKind === 'project'
                    ? insightsForProject(activeInsights, modal.entity)
                    : insightsForOutcome(activeInsights, modal.entity)
              }
              onCreate={createInsight}
              onUpdate={patchInsight}
              onDelete={removeInsight}
              onValidate={approveInsight}
              onReject={rejectInsight}
              onReopen={reopenInsight}
            />
          ) : modal.kind === 'impact' ? (
            <ImpactForm
              key={modal.impact?.id ?? 'new'}
              editing={modal.impact}
              parentFields={hierarchy.fields}
              targets={modal.impact ? targetsFor(targets, modal.impact, 'impact') : []}
              impacts={impacts}
              allTargets={targets}
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
              parentFields={hierarchy.fields}
              onSubmit={saveTeam}
              onCancel={() => setModal(null)}
              onDelete={() => removeTeam(modal.team)}
            />
          ) : modal.kind === 'target-measurements' ? (
            <TargetMeasurements
              target={targets.find((item) => item.id === modal.target.id) ?? modal.target}
              measurements={measurements}
              onAddReading={addReading}
              onDeleteReading={removeMeasurement}
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
              parentFields={hierarchy.fields}
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
              parentFields={hierarchy.fields}
              teams={teams}
              outcomes={outcomes}
              projects={projects}
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
        </ModalSurface>
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

// Field values compared for equality; id lists match whether they hold numbers or strings.
function sameValue(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => String(x) === String(b[i]));
  return a === b;
}

// What opening a card on the map shows: the card's own item, or a target and
// its readings, reached from a card or from that item's form. New items, and
// everything else, still open over the page.
function opensFromCard(modal) {
  if (['target', 'target-measurements', 'measurement'].includes(modal.kind)) return true;
  return ['outcome', 'impact', 'project'].includes(modal.kind) && Boolean(modal[modal.kind]);
}

function modalTitle({ kind, rule, outcome, parent, target, project, team, impact, entity }) {
  if (kind === 'account') return 'Account settings';
  if (kind === 'members') return 'Members';
  if (kind === 'issue') return `${rule.emoji} ${rule.title}`;
  if (kind === 'impact') return impact ? `Impact #${impact.id}` : parent ? 'New child impact' : 'New impact';
  if (kind === 'entity-insights') return `Insights · ${entity.name}`;
  if (kind === 'team') return team ? `Team #${team.id}` : 'New team';
  if (kind === 'target') return target ? `Target #${target.id}` : 'New target';
  if (kind === 'measurement') return 'New measurement';
  if (kind === 'target-measurements') return targetLabel(target);
  if (kind === 'project') return project ? `Project #${project.id}` : 'New project';
  if (outcome) return `Outcome #${outcome.id}`;
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
