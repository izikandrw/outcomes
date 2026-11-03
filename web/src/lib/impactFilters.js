import { insightsForOutcome, outcomesForImpact, projectsForImpact, targetsForImpact, teamsOnOutcome, teamsOnProject } from './links.js';
import { targetStatus } from './outcomeFilters.js';
import { RULES } from './validation.js';

// The fields the impacts page filters on, in the shape FilterBar and
// matchesFilters (insightFilters.js) take, as outcomeFilters.js does for
// outcomes. An impact has no team or evidence of its own, so those fields read
// through the outcomes driving it.
const NONE = 'none';

// `issues` maps an impact id to the delivery rules it breaks (validateTree's
// `impact` map), worked out over the whole tree rather than the shown list.
export function impactFilterFields({
  impacts,
  outcomes,
  teams,
  projects,
  targets,
  insights,
  suggestions,
  issues,
  now = Date.now(),
}) {
  const impactRules = RULES.filter((rule) => rule.appliesTo === 'impact');
  const sameId = (a, b) => a != null && String(a) === String(b);
  const driving = (impact) => outcomesForImpact(outcomes, impact);

  return [
    {
      id: 'issue',
      primary: true,
      label: 'Issues',
      options: [
        ...impactRules.map((rule) => ({ id: rule.id, label: `${rule.emoji} ${rule.title}` })),
        { id: NONE, label: 'No issues' },
      ],
      values: (impact) => {
        const broken = (issues?.get(impact.id) ?? []).map((rule) => rule.id);
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
      // Any team working on an outcome or project driving it, directly or beneath it.
      values: (impact) => {
        const working = new Set(
          [
            ...driving(impact).flatMap((outcome) => teamsOnOutcome(outcomes, projects, outcome)),
            ...projectsForImpact(projects, impact).flatMap((project) => teamsOnProject(projects, project)),
          ].map((entry) => String(entry.teamId)),
        );
        return working.size ? [...working] : [NONE];
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
      values: (impact) => {
        const statuses = targetsForImpact(targets, impact).map((target) => targetStatus(target, now));
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
      // Insights on the outcomes driving it.
      values: (impact) => {
        const outcomesOf = driving(impact);
        const backed = outcomesOf.some((outcome) => insightsForOutcome(insights, outcome).length);
        const carried = [backed ? 'insights' : NONE];
        if (outcomesOf.some((outcome) => insightsForOutcome(suggestions, outcome).length)) carried.push('suggested');
        return carried;
      },
    },
    {
      id: 'outcome',
      label: 'Outcome',
      options: [
        ...outcomes
          .filter((outcome) => outcome.impact_id != null)
          .map((outcome) => ({ id: String(outcome.id), label: outcome.name })),
        { id: NONE, label: 'No outcomes' },
      ],
      values: (impact) => {
        const linked = driving(impact).map((outcome) => String(outcome.id));
        return linked.length ? linked : [NONE];
      },
      searchable: true,
    },
    {
      id: 'level',
      label: 'Level',
      options: [
        { id: 'top', label: 'Top-level impact' },
        { id: 'child', label: 'Child impact' },
        { id: 'parent', label: 'Has child impacts' },
      ],
      values: (impact) => {
        const carried = [impact.parent_impact_id == null ? 'top' : 'child'];
        if (impacts.some((other) => sameId(other.parent_impact_id, impact.id))) carried.push('parent');
        return carried;
      },
    },
  ];
}
