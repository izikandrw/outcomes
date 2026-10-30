import { IMPACT_AREAS, INSIGHT_TYPES, SENTIMENTS, isEvidence } from './links.js';

// The fields the insights page filters on; `primary` ones are always on show,
// the rest sit behind "More filters". Each field lists its options and
// says which of them an insight carries; an insight can carry several (an
// insight observed last week is within 30, 90 and 365 days). A filter keeps
// insights carrying any picked option of a field, and every field must pass.
const DAY = 24 * 60 * 60 * 1000;
const NONE = 'none';

const ids = (list) => (list ?? []).map(String);

export function insightFilterFields({ insights, outcomes, projects, teams, now = Date.now() }) {
  const sources = [...new Set(insights.map((insight) => insight.source_system).filter(Boolean))].sort();

  const fields = [
    {
      id: 'status',
      primary: true,
      label: 'Status',
      options: [
        { id: 'verified', label: 'Verified' },
        { id: 'suggested', label: 'Suggested' },
      ],
      values: (insight) => [isEvidence(insight) ? 'verified' : 'suggested'],
    },
    {
      id: 'type',
      primary: true,
      label: 'Type',
      options: INSIGHT_TYPES,
      values: (insight) => [insight.type],
    },
    {
      id: 'sentiment',
      primary: true,
      label: 'Sentiment',
      options: [
        ...SENTIMENTS.map((entry) => ({ id: entry.id, label: `${entry.emoji} ${entry.label}` })),
        { id: NONE, label: 'No sentiment' },
      ],
      values: (insight) => [insight.sentiment || NONE],
    },
    {
      id: 'impact_area',
      label: 'Impact area',
      options: [...IMPACT_AREAS, { id: NONE, label: 'No impact area' }],
      values: (insight) => [insight.impact_area || NONE],
    },
    {
      id: 'evidence',
      primary: true,
      label: 'Evidence',
      options: [
        { id: 'firsthand', label: 'Firsthand' },
        { id: 'relayed', label: 'Relayed' },
        { id: NONE, label: 'Not stated' },
      ],
      values: (insight) => [insight.firsthand === true ? 'firsthand' : insight.firsthand === false ? 'relayed' : NONE],
    },
    {
      id: 'source',
      primary: true,
      label: 'Source',
      options: [...sources.map((source) => ({ id: source, label: source })), { id: NONE, label: 'Entered by hand' }],
      values: (insight) => [insight.source_system || NONE],
    },
    {
      id: 'team',
      label: 'Team',
      options: [...teams.map((team) => ({ id: String(team.id), label: team.name })), { id: NONE, label: 'No team' }],
      values: (insight) => [insight.team_id == null ? NONE : String(insight.team_id)],
      searchable: true,
      hidden: teams.length === 0,
    },
    {
      id: 'outcome',
      label: 'Outcome',
      options: outcomes.map((outcome) => ({ id: String(outcome.id), label: outcome.name })),
      values: (insight) => ids(insight.outcome_ids),
      searchable: true,
      hidden: outcomes.length === 0,
    },
    {
      id: 'project',
      label: 'Project',
      options: projects.map((project) => ({ id: String(project.id), label: project.name })),
      values: (insight) => ids(insight.project_ids),
      searchable: true,
      hidden: projects.length === 0,
    },
    {
      id: 'links',
      primary: true,
      label: 'Links',
      options: [
        { id: 'outcome', label: 'Supports an outcome' },
        { id: 'project', label: 'Supports a project' },
        { id: NONE, label: 'Not linked to anything' },
      ],
      values: (insight) => {
        const linked = [];
        if (ids(insight.outcome_ids).length) linked.push('outcome');
        if (ids(insight.project_ids).length) linked.push('project');
        return linked.length ? linked : [NONE];
      },
    },
    {
      id: 'dollar',
      label: 'Dollar impact',
      options: [
        { id: 'priced', label: 'Has a dollar impact' },
        { id: NONE, label: 'No dollar impact' },
      ],
      values: (insight) => [insight.dollar_impact != null ? 'priced' : NONE],
    },
    {
      id: 'observed',
      primary: true,
      label: 'Observed',
      options: [
        { id: '30', label: 'Last 30 days' },
        { id: '90', label: 'Last 90 days' },
        { id: '365', label: 'Last 12 months' },
        { id: 'older', label: 'Over 12 months ago' },
        { id: NONE, label: 'No date' },
      ],
      values: (insight) => {
        if (!insight.observed_at) return [NONE];
        const age = now - new Date(insight.observed_at).getTime();
        const within = ['30', '90', '365'].filter((days) => age <= Number(days) * DAY);
        return within.length ? within : ['older'];
      },
    },
  ];
  return fields.filter((field) => !field.hidden);
}

// `filters` maps a field id to the option ids picked for it. `skip` leaves one
// field out, so a field's own counts show what picking each option would give.
export function matchesFilters(insight, fields, filters, skip) {
  return fields.every((field) => {
    const picked = filters[field.id];
    if (field.id === skip || !picked?.length) return true;
    return field.values(insight).some((value) => picked.includes(value));
  });
}

export const INSIGHT_SORTS = [
  {
    id: 'observed',
    label: 'Newest observed',
    compare: (a, b) => dateOf(b) - dateOf(a),
  },
  {
    id: 'added',
    label: 'Recently added',
    compare: (a, b) => new Date(b.created_at) - new Date(a.created_at) || b.id - a.id,
  },
  {
    id: 'dollar',
    label: 'Highest dollar impact',
    compare: (a, b) => Number(b.dollar_impact ?? -Infinity) - Number(a.dollar_impact ?? -Infinity) || dateOf(b) - dateOf(a),
  },
  {
    id: 'links',
    label: 'Most linked',
    compare: (a, b) => linkCount(b) - linkCount(a) || dateOf(b) - dateOf(a),
  },
];

// Undated insights fall back to when they were recorded.
const dateOf = (insight) => new Date(insight.observed_at ?? insight.created_at ?? 0).getTime();
const linkCount = (insight) => ids(insight.outcome_ids).length + ids(insight.project_ids).length;
