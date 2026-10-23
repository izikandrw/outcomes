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
  { id: 'other', label: 'Other' },
];

export const insightTypeLabel = (type) =>
  INSIGHT_TYPES.find((entry) => entry.id === type)?.label ?? type;

// Whole dollars when the amount is whole, cents otherwise. NUMERIC columns
// arrive as strings, so this takes either.
export const formatDollars = (value) =>
  Number(value).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: Number.isInteger(Number(value)) ? 0 : 2,
  });
