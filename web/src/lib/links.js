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
