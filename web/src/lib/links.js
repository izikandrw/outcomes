// ids arrive from pg as strings for BIGINT columns, so everything is compared
// stringified rather than by value.
const same = (a, b) => a != null && b != null && String(a) === String(b);

// A project reaches an outcome two ways: the project_outcomes join (exposed as
// outcome_ids) and the older outcomes.project_id column. Both are honoured so
// rows created either way still show up.
export function projectsForOutcome(projects, outcome) {
  return projects.filter(
    (project) =>
      (project.outcome_ids ?? []).some((id) => same(id, outcome.id)) ||
      same(project.id, outcome.project_id)
  );
}

export function targetsForOutcome(targets, outcome) {
  return targets.filter((target) => same(target.outcome_id, outcome.id));
}

// An impact is measured directly: its targets are the business result as
// numbers, separate from the behavior targets on the outcomes beneath it.
export function targetsForImpact(targets, impact) {
  return targets.filter((target) => same(target.impact_id, impact.id));
}

// A target's name is optional; the unit labels one that has none, so a lone
// "1000 → 1200 ARR" under "Grow revenue" doesn't need a second name.
export function targetLabel(target) {
  return target.name || target.unit;
}

// "1000 → 1200 ARR": the numbers a target stands for.
export function targetRange(target) {
  return `${formatValue(target.baseline_value)} → ${formatValue(target.target_value)} ${target.unit}`;
}

// Targets and readings hang off either an outcome or an impact; `kind` says
// which the entity is.
export function targetsFor(targets, entity, kind) {
  return kind === 'impact' ? targetsForImpact(targets, entity) : targetsForOutcome(targets, entity);
}

// Only top-level outcomes carry an impact link; this is the outcomes drawn
// directly under the impact.
export function outcomesForImpact(outcomes, impact) {
  return outcomes.filter((outcome) => same(outcome.impact_id, impact.id));
}

// The reverse of projectsForOutcome: every outcome that links to this project,
// via either the join table or the legacy single-column link. Empty means the
// project can't name the outcome it drives.
export function outcomesForProject(outcomes, project) {
  return outcomes.filter((outcome) => projectsForOutcome([project], outcome).length > 0);
}

// An outcome earns its place once something carries it forward: a child
// outcome narrowing it further, or a project driving it. Neither means it's a
// dead end — either it should have one, or it shouldn't exist as its own node.
export function outcomeHasChildren(outcomes, projects, outcome) {
  const hasChildOutcome = outcomes.some((candidate) => same(candidate.parent_outcome_id, outcome.id));
  return hasChildOutcome || projectsForOutcome(projects, outcome).length > 0;
}

// Every row beneath `root` in a parent-pointer hierarchy, however deep.
function descendantsOf(items, parentKey, root) {
  const found = [];
  const seen = new Set([String(root.id)]);
  const queue = [root];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const item of items) {
      if (!same(item[parentKey], current.id) || seen.has(String(item.id))) continue;
      seen.add(String(item.id));
      found.push(item);
      queue.push(item);
    }
  }
  return found;
}

// Collapses two lists of team ids into one entry per team, direct first. A team
// that is both direct and indirect counts as direct.
function teamEntries(directIds, indirectIds) {
  const entries = [];
  const seen = new Set();
  for (const [ids, direct] of [
    [directIds, true],
    [indirectIds, false],
  ]) {
    for (const id of ids) {
      if (id == null || seen.has(String(id))) continue;
      seen.add(String(id));
      entries.push({ teamId: id, direct });
    }
  }
  return entries;
}

// Projects an outcome can't link to directly because they already sit under
// one of its ancestors or descendants; the server rejects that link, since the
// ancestor reaches the project through the descendant anyway. `outcome` may be
// a draft with only parent_outcome_id set, for one not yet created.
export function projectsLinkedInLineage(outcomes, projects, outcome) {
  const lineage = outcome.id == null ? [] : descendantsOf(outcomes, 'parent_outcome_id', outcome);
  const seen = new Set([String(outcome.id)]);
  let parentId = outcome.parent_outcome_id;
  while (parentId != null && !seen.has(String(parentId))) {
    seen.add(String(parentId));
    const parent = outcomes.find((candidate) => same(candidate.id, parentId));
    if (!parent) break;
    lineage.push(parent);
    parentId = parent.parent_outcome_id;
  }
  return new Set(lineage.flatMap((relative) => projectsForOutcome(projects, relative)).map((p) => String(p.id)));
}

// What dropping one map node on another links, as { parent, child } nodes
// ({ type, data }), or { reason } when the two can't be linked that way.
// Between different kinds the hierarchy fixes the direction (impact above
// outcome above project); between two of a kind the node dragged from becomes
// the parent, the way the arrow is drawn. A new parent replaces the child's old
// one, except for a project, which can drive several outcomes at once.
export function linkBetween(from, to, { impacts, outcomes, projects }) {
  if (from.type === to.type && same(from.data.id, to.data.id)) return { reason: 'Drop on another node to link them' };
  const rank = { impact: 0, outcome: 1, project: 2 };
  if (Math.abs(rank[from.type] - rank[to.type]) > 1) return { reason: 'An impact can’t link straight to a project' };
  const [parent, child] = rank[from.type] <= rank[to.type] ? [from, to] : [to, from];
  const named = (node) => `“${node.data.name}”`;
  // An outcome hangs off either a parent outcome or an impact, never both.
  const moves =
    child.type === 'outcome'
      ? child.data.parent_outcome_id != null || child.data.impact_id != null
      : child.type === parent.type && child.data[`parent_${child.type}_id`] != null;

  if (parent.type !== child.type) {
    if (child.type === 'outcome') {
      return same(child.data.impact_id, parent.data.id) && child.data.parent_outcome_id == null
        ? { reason: `${named(child)} already drives ${named(parent)}` }
        : { parent, child, moves };
    }
    if (projectsForOutcome(projects, parent.data).some((project) => same(project.id, child.data.id))) {
      return { reason: `${named(child)} already drives ${named(parent)}` };
    }
    if (projectsLinkedInLineage(outcomes, projects, parent.data).has(String(child.data.id))) {
      return { reason: `${named(child)} already rolls up to ${named(parent)} through a related outcome` };
    }
    return { parent, child };
  }

  const parentKey = `parent_${child.type}_id`;
  if (same(child.data[parentKey], parent.data.id)) {
    return { reason: `${named(child)} is already under ${named(parent)}` };
  }
  const items = { impact: impacts, outcome: outcomes, project: projects }[child.type];
  if (descendantsOf(items, parentKey, child.data).some((item) => same(item.id, parent.data.id))) {
    return { reason: `${named(parent)} sits beneath ${named(child)}` };
  }
  return { parent, child, moves };
}

// Teams working on a project: the team that owns it (direct), plus the teams
// owning any project nested beneath it (indirect).
export function teamsOnProject(projects, project) {
  return teamEntries(
    [project.team_id],
    descendantsOf(projects, 'parent_project_id', project).map((child) => child.team_id)
  );
}

// Teams working on an outcome. Direct: the accountable team and the teams
// running projects linked straight to it. Indirect: teams working on anything
// beneath it, meaning child outcomes, the projects driving those, and projects
// nested under any of those projects.
export function teamsOnOutcome(outcomes, projects, outcome) {
  const linked = projectsForOutcome(projects, outcome);
  const childOutcomes = descendantsOf(outcomes, 'parent_outcome_id', outcome);

  const childProjects = new Map();
  for (const child of childOutcomes) {
    for (const project of projectsForOutcome(projects, child)) childProjects.set(String(project.id), project);
  }
  const nestedProjects = [...linked, ...childProjects.values()].flatMap((project) =>
    descendantsOf(projects, 'parent_project_id', project)
  );

  return teamEntries(
    [outcome.team_id, ...linked.map((project) => project.team_id)],
    [
      ...childOutcomes.map((child) => child.team_id),
      ...[...childProjects.values()].map((project) => project.team_id),
      ...nestedProjects.map((project) => project.team_id),
    ]
  );
}

// The team and every team nested beneath it, as a set of stringified ids.
export function teamIdsWithin(teams, team) {
  const ids = new Set([String(team.id)]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const candidate of teams) {
      if (candidate.parent_team_id == null || ids.has(String(candidate.id))) continue;
      if (!ids.has(String(candidate.parent_team_id))) continue;
      ids.add(String(candidate.id));
      grew = true;
    }
  }
  return ids;
}

// How a set of projects rolls up: each project under the outcome(s) it drives,
// those outcomes under their ancestors, and the top-level outcomes under their
// impact (and its parent impacts). Only branches that lead to one of the
// projects are kept. Returns { roots, noImpact, unlinkedProjects }: impact
// trees, outcome trees with no impact above them, and projects that drive no
// outcome at all.
export function rollupForProjects(teamProjects, outcomes, impacts) {
  const outcomeById = new Map(outcomes.map((outcome) => [String(outcome.id), outcome]));
  const impactById = new Map(impacts.map((impact) => [String(impact.id), impact]));

  const keptOutcomes = new Set();
  const unlinkedProjects = [];
  for (const project of teamProjects) {
    const driven = outcomesForProject(outcomes, project);
    if (driven.length === 0) unlinkedProjects.push(project);
    for (const outcome of driven) {
      let current = outcome;
      while (current && !keptOutcomes.has(String(current.id))) {
        keptOutcomes.add(String(current.id));
        current = current.parent_outcome_id == null ? null : outcomeById.get(String(current.parent_outcome_id));
      }
    }
  }

  // `path` guards against a parent cycle the API doesn't reject for outcomes.
  const outcomeNode = (outcome, path = new Set()) => {
    const here = new Set([...path, String(outcome.id)]);
    return {
      kind: 'outcome',
      data: outcome,
      children: [
        ...outcomes
          .filter((child) => keptOutcomes.has(String(child.id)) && same(child.parent_outcome_id, outcome.id) && !here.has(String(child.id)))
          .map((child) => outcomeNode(child, here)),
        ...projectsForOutcome(teamProjects, outcome).map((project) => ({ kind: 'project', data: project, children: [] })),
      ],
    };
  };

  const topOutcomes = outcomes.filter(
    (outcome) =>
      keptOutcomes.has(String(outcome.id)) &&
      (outcome.parent_outcome_id == null || !outcomeById.has(String(outcome.parent_outcome_id)))
  );

  const keptImpacts = new Set();
  const noImpact = [];
  for (const outcome of topOutcomes) {
    let current = impactById.get(String(outcome.impact_id));
    if (!current) noImpact.push(outcome);
    while (current && !keptImpacts.has(String(current.id))) {
      keptImpacts.add(String(current.id));
      current = impactById.get(String(current.parent_impact_id));
    }
  }

  const impactNode = (impact, path = new Set()) => {
    const here = new Set([...path, String(impact.id)]);
    return {
      kind: 'impact',
      data: impact,
      children: [
        ...impacts
          .filter((child) => keptImpacts.has(String(child.id)) && same(child.parent_impact_id, impact.id) && !here.has(String(child.id)))
          .map((child) => impactNode(child, here)),
        ...topOutcomes.filter((outcome) => same(outcome.impact_id, impact.id)).map((outcome) => outcomeNode(outcome)),
      ],
    };
  };

  const roots = impacts
    .filter(
      (impact) =>
        keptImpacts.has(String(impact.id)) &&
        (impact.parent_impact_id == null || !keptImpacts.has(String(impact.parent_impact_id)))
    )
    .map((impact) => impactNode(impact));

  return { roots, noImpact: noImpact.map((outcome) => outcomeNode(outcome)), unlinkedProjects };
}

// Oldest first: a series is only meaningful read in order.
export function measurementsForTarget(measurements, target) {
  return measurements
    .filter((measurement) => same(measurement.target_id, target.id))
    .sort((a, b) => new Date(a.measured_at) - new Date(b.measured_at));
}

// Readings no longer hang off an outcome directly; they are reached through its
// targets. Used for the counts the tree and list show on a node.
export function measurementsForOutcome(measurements, targets, outcome) {
  const ids = new Set(targetsForOutcome(targets, outcome).map((target) => String(target.id)));
  return measurements.filter((measurement) => ids.has(String(measurement.target_id)));
}

// How far a target has travelled from its baseline toward its target value, as
// a fraction. Subtracting the baseline on both sides means a target that should
// go down (100 → 50) reports positive progress the same as one going up.
// Returns null when there is nothing to report: no reading yet, or a baseline
// equal to the target value, which is what migration 003 seeds.
export function progressOf(target) {
  if (target.latest_value == null) return null;
  const span = Number(target.target_value) - Number(target.baseline_value);
  if (span === 0) return null;
  return (Number(target.latest_value) - Number(target.baseline_value)) / span;
}

// Trims trailing zeros so 487 reads as "487" and 4.5 still reads as "4.5".
export function formatValue(value) {
  if (value == null) return '—';
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  return String(Number(number.toFixed(2)));
}

// Insights are evidence attached to an outcome or a project; the join ids ride
// along on each insight as outcome_ids / project_ids.
export function insightsForOutcome(insights, outcome) {
  return insights.filter((insight) => (insight.outcome_ids ?? []).some((id) => same(id, outcome.id)));
}

export function insightsForProject(insights, project) {
  return insights.filter((insight) => (insight.project_ids ?? []).some((id) => same(id, project.id)));
}

// Only a validated insight is evidence. The insight collector's suggestions
// wait in the review queue as unvalidated and must not count toward an
// outcome's evidence until a person approves them; rejected ones never do.
export const isEvidence = (insight) => (insight.status ?? 'validated') === 'validated';

export const REJECTION_REASONS = [
  { id: 'not_an_insight', label: 'Not an insight' },
  { id: 'inaccurate', label: 'Inaccurate' },
  { id: 'wrong_link', label: 'Linked to the wrong work' },
  { id: 'duplicate', label: 'Duplicate' },
  { id: 'other', label: 'Other' },
];

export const rejectionReasonLabel = (reason) =>
  REJECTION_REASONS.find((entry) => entry.id === reason)?.label ?? reason;

// The outcomes and projects the insight collector has proposed but nobody has
// created yet, shaped like real ones so the map can draw them. Insights awaiting
// review each keep their own copy of a proposal, so the same name (ignoring case
// and surrounding space, as src/lib/adoptProposals.js matches) is merged into
// one. A name that already exists is skipped: creating it adopts those
// proposals anyway. None has a parent; a suggested project drives whatever its
// insights link to, plus any outcome the same insight proposed alongside it.
// Ids are strings prefixed "suggested:" so they never clash with real ones.
export function suggestedEntities(suggestions, outcomes, projects) {
  const key = (name) => String(name ?? '').trim().toLowerCase();
  const taken = {
    outcome: new Set(outcomes.map((outcome) => key(outcome.name))),
    project: new Set(projects.map((project) => key(project.name))),
  };
  const found = { outcome: new Map(), project: new Map() };
  for (const insight of suggestions) {
    for (const proposal of insight.proposed_links ?? []) {
      const kind = proposal.kind === 'project' ? 'project' : 'outcome';
      const name = key(proposal.name);
      if (!name || taken[kind].has(name)) continue;
      if (!found[kind].has(name)) {
        found[kind].set(name, {
          id: `suggested:${kind}:${name}`,
          name: proposal.name.trim(),
          description: proposal.description ?? null,
          suggested: true,
          insight_ids: [],
          ...(kind === 'project'
            ? { outcome_ids: [], parent_project_id: null }
            : { parent_outcome_id: null, impact_id: null }),
        });
      }
      const entity = found[kind].get(name);
      if (!entity.insight_ids.some((id) => same(id, insight.id))) entity.insight_ids.push(insight.id);
    }
  }
  for (const insight of suggestions) {
    const proposals = insight.proposed_links ?? [];
    const proposedOutcomes = proposals
      .filter((proposal) => proposal.kind !== 'project')
      .map((proposal) => found.outcome.get(key(proposal.name))?.id)
      .filter(Boolean);
    for (const proposal of proposals) {
      const project = proposal.kind === 'project' && found.project.get(key(proposal.name));
      if (!project) continue;
      for (const id of [...(insight.outcome_ids ?? []), ...proposedOutcomes]) {
        if (!project.outcome_ids.some((linked) => same(linked, id))) project.outcome_ids.push(id);
      }
    }
  }
  return { outcomes: [...found.outcome.values()], projects: [...found.project.values()] };
}

// Sum of the dollar impact across a set of insights; null when none is priced.
export function totalDollarImpact(insights) {
  const priced = insights.filter((insight) => insight.dollar_impact != null);
  return priced.length === 0 ? null : priced.reduce((sum, insight) => sum + Number(insight.dollar_impact), 0);
}

export const INSIGHT_TYPES = [
  { id: 'support_ticket', label: 'Support ticket' },
  { id: 'session_recording', label: 'Session recording' },
  { id: 'interview', label: 'Interview' },
  { id: 'funnel', label: 'Funnel' },
  { id: 'experiment', label: 'Experiment' },
  { id: 'sales_call', label: 'Sales call' },
  { id: 'feature_request', label: 'Feature request' },
  { id: 'survey', label: 'Survey' },
  { id: 'review', label: 'Review' },
  { id: 'competitor', label: 'Competitor' },
  { id: 'other', label: 'Other' },
];

export const insightTypeLabel = (type) =>
  INSIGHT_TYPES.find((entry) => entry.id === type)?.label ?? type;

export const IMPACT_AREAS = [
  { id: 'acquisition', label: 'Acquisition' },
  { id: 'activation', label: 'Activation' },
  { id: 'retention', label: 'Retention' },
  { id: 'expansion', label: 'Expansion' },
  { id: 'cost', label: 'Cost' },
  { id: 'other', label: 'Other' },
];

export const impactAreaLabel = (area) =>
  IMPACT_AREAS.find((entry) => entry.id === area)?.label ?? area;

// Good, bad or neither for the customer. Insights from before sentiment existed
// have none.
export const SENTIMENTS = [
  { id: 'positive', label: 'Positive', emoji: '😊' },
  { id: 'neutral', label: 'Neutral', emoji: '😐' },
  { id: 'negative', label: 'Negative', emoji: '😞' },
];

export const sentimentOf = (sentiment) => SENTIMENTS.find((entry) => entry.id === sentiment) ?? null;

// Whole dollars when the amount is whole, cents otherwise. NUMERIC columns
// arrive as strings, so this takes either.
export const formatDollars = (value) =>
  Number(value).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: Number.isInteger(Number(value)) ? 0 : 2,
  });

// Dates come from a date input as UTC midnight, so the quarter is read in UTC.
export function formatQuarter(value) {
  if (!value) return null;
  const date = new Date(value);
  return `Q${Math.floor(date.getUTCMonth() / 3) + 1} ${date.getUTCFullYear()}`;
}
