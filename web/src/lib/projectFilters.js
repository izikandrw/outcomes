import { insightsForProject, outcomesForProject, teamsOnProject } from './links.js';
import { RULES } from './validation.js';

// The fields the projects page filters on, in the shape FilterBar and
// matchesFilters (insightFilters.js) take, as outcomeFilters.js does for
// outcomes. A project reaches an impact only through the outcomes it drives.
const NONE = 'none';

// Where a project sits in time: not started, running, finished, or never
// scheduled. Dates come from a date input as UTC midnight, so a project ending
// today counts as running until the day is over.
const DAY = 24 * 60 * 60 * 1000;
export function scheduleStatus(project, now) {
  const start = project.start_at ? new Date(project.start_at).getTime() : null;
  const end = project.end_at ? new Date(project.end_at).getTime() + DAY : null;
  if (start == null && end == null) return 'unscheduled';
  if (end != null && end <= now) return 'done';
  if (start != null && start > now) return 'upcoming';
  return 'running';
}

// `issues` maps a project id to the delivery rules it breaks (validateTree's
// `project` map), worked out over the whole tree rather than the shown list.
export function projectFilterFields({
  projects,
  outcomes,
  teams,
  impacts,
  insights,
  suggestions,
  issues,
  now = Date.now(),
}) {
  const projectRules = RULES.filter((rule) => rule.appliesTo === 'project');
  const sameId = (a, b) => a != null && String(a) === String(b);

  const fields = [
    {
      id: 'issue',
      primary: true,
      label: 'Issues',
      options: [
        ...projectRules.map((rule) => ({ id: rule.id, label: `${rule.emoji} ${rule.title}` })),
        { id: NONE, label: 'No issues' },
      ],
      values: (project) => {
        const broken = (issues?.get(project.id) ?? []).map((rule) => rule.id);
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
      // The team running it, plus teams running projects nested beneath it.
      values: (project) => {
        const working = teamsOnProject(projects, project).map((entry) => String(entry.teamId));
        return working.length ? working : [NONE];
      },
      searchable: true,
    },
    {
      id: 'schedule',
      primary: true,
      label: 'Schedule',
      options: [
        { id: 'running', label: 'In progress' },
        { id: 'upcoming', label: 'Upcoming' },
        { id: 'done', label: 'Finished' },
        { id: 'unscheduled', label: 'Unscheduled' },
      ],
      values: (project) => [scheduleStatus(project, now)],
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
      values: (project) => {
        const carried = [insightsForProject(insights, project).length ? 'insights' : NONE];
        if (insightsForProject(suggestions, project).length) carried.push('suggested');
        return carried;
      },
    },
    {
      id: 'outcome',
      label: 'Outcome',
      options: [
        ...outcomes.map((outcome) => ({ id: String(outcome.id), label: outcome.name })),
        { id: NONE, label: 'No outcome' },
      ],
      values: (project) => {
        const driven = outcomesForProject(outcomes, project).map((outcome) => String(outcome.id));
        return driven.length ? driven : [NONE];
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
      // The impact each driven outcome rolls up to, following parent outcomes
      // to the top-level one that carries the link.
      values: (project) => {
        const reached = new Set();
        for (const outcome of outcomesForProject(outcomes, project)) {
          let current = outcome;
          const seen = new Set();
          while (current && !seen.has(String(current.id))) {
            seen.add(String(current.id));
            if (current.impact_id != null) {
              reached.add(String(current.impact_id));
              break;
            }
            current = outcomes.find((other) => sameId(other.id, current.parent_outcome_id));
          }
        }
        return reached.size ? [...reached] : [NONE];
      },
      searchable: true,
      hidden: impacts.length === 0,
    },
    {
      id: 'level',
      label: 'Level',
      options: [
        { id: 'top', label: 'Top-level project' },
        { id: 'child', label: 'Child project' },
        { id: 'parent', label: 'Has child projects' },
      ],
      values: (project) => {
        const carried = [project.parent_project_id == null ? 'top' : 'child'];
        if (projects.some((other) => sameId(other.parent_project_id, project.id))) carried.push('parent');
        return carried;
      },
    },
  ];
  return fields.filter((field) => !field.hidden);
}
