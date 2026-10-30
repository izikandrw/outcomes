import { insightsForOutcome, progressOf, projectsForOutcome, targetsForOutcome, teamsOnOutcome } from './links.js';
import { RULES } from './validation.js';

// The fields the outcomes page filters on, in the shape FilterBar and
// matchesFilters (insightFilters.js) take: `primary` ones are always on show,
// and each field says which of its options an outcome carries. An outcome can
// carry several, e.g. one target reached and another overdue.
const NONE = 'none';

// What a target says about progress: reached, overdue, under way, or nothing
// measured yet. Overdue wins over under way, since it's the one to chase.
export function targetStatus(target, now) {
  const progress = progressOf(target);
  if (progress != null && progress >= 1) return 'reached';
  if (target.due_at && new Date(target.due_at).getTime() < now) return 'overdue';
  return target.latest_value == null ? 'unmeasured' : 'moving';
}

// `issues` maps an outcome id to the delivery rules it breaks (validateTree's
// `outcome` map), worked out over the whole tree rather than the shown list.
export function outcomeFilterFields({
  outcomes,
  teams,
  projects,
  impacts,
  targets,
  insights,
  suggestions,
  issues,
  now = Date.now(),
}) {
  const outcomeRules = RULES.filter((rule) => rule.appliesTo === 'outcome');
  const sameId = (a, b) => a != null && String(a) === String(b);

  const fields = [
    {
      id: 'issue',
      primary: true,
      label: 'Issues',
      options: [
        ...outcomeRules.map((rule) => ({ id: rule.id, label: `${rule.emoji} ${rule.title}` })),
        { id: NONE, label: 'No issues' },
      ],
      values: (outcome) => {
        const broken = (issues?.get(outcome.id) ?? []).map((rule) => rule.id);
        return broken.length ? broken : [NONE];
      },
    },
    {
      id: 'team',
      primary: true,
      label: 'Team',
      options: [
        ...teams.map((team) => ({ id: String(team.id), label: team.name })),
        { id: NONE, label: 'No team' },
      ],
      // Any team working on it, directly or beneath it, as its chips show.
      values: (outcome) => {
        const working = teamsOnOutcome(outcomes, projects, outcome).map((entry) => String(entry.teamId));
        return working.length ? working : [NONE];
      },
      searchable: true,
    },
    {
      id: 'targets',
      primary: true,
      label: 'Targets',
      options: [
        { id: 'reached', label: 'Reached' },
        { id: 'moving', label: 'Under way' },
        { id: 'overdue', label: 'Overdue' },
        { id: 'unmeasured', label: 'No readings yet' },
        { id: NONE, label: 'No target' },
      ],
      values: (outcome) => {
        const statuses = targetsForOutcome(targets, outcome).map((target) => targetStatus(target, now));
        return statuses.length ? [...new Set(statuses)] : [NONE];
      },
    },
    {
      id: 'evidence',
      primary: true,
      label: 'Evidence',
      options: [
        { id: 'insights', label: 'Backed by insights' },
        { id: 'suggested', label: 'Suggestions to review' },
        { id: NONE, label: 'No insights' },
      ],
      values: (outcome) => {
        const carried = [insightsForOutcome(insights, outcome).length ? 'insights' : NONE];
        if (insightsForOutcome(suggestions, outcome).length) carried.push('suggested');
        return carried;
      },
    },
    {
      id: 'project',
      label: 'Project',
      options: [
        ...projects.map((project) => ({ id: String(project.id), label: project.name })),
        { id: NONE, label: 'No project' },
      ],
      values: (outcome) => {
        const linked = projectsForOutcome(projects, outcome).map((project) => String(project.id));
        return linked.length ? linked : [NONE];
      },
      searchable: true,
    },
    {
      id: 'impact',
      label: 'Impact',
      options: [
        ...impacts.map((impact) => ({ id: String(impact.id), label: impact.name })),
        { id: NONE, label: 'No impact' },
      ],
      values: (outcome) => [outcome.impact_id != null ? String(outcome.impact_id) : NONE],
      searchable: true,
      hidden: impacts.length === 0,
    },
    {
      id: 'level',
      label: 'Level',
      options: [
        { id: 'top', label: 'Top-level outcome' },
        { id: 'child', label: 'Child outcome' },
        { id: 'parent', label: 'Has child outcomes' },
      ],
      values: (outcome) => {
        const carried = [outcome.parent_outcome_id == null ? 'top' : 'child'];
        if (outcomes.some((other) => sameId(other.parent_outcome_id, outcome.id))) carried.push('parent');
        return carried;
      },
    },
  ];
  return fields.filter((field) => !field.hidden);
}
