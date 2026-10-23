import {
  insightsForOutcome,
  outcomesForImpact,
  outcomesForProject,
  projectsForOutcome,
} from './links.js';

// Rules for "Are we working on the right things?" (product/jtbds/delivery.md).
// Each rule names a way the impact tree can be hope instead of a plan. The
// tree badges nodes with `emoji`; the issues page groups by rule.

// "Much evidence" — an outcome backed by fewer insights than this is a guess.
export const MIN_INSIGHTS = 1;

export const RULES = [
  {
    id: 'chimerical-impact',
    emoji: '🐉',
    appliesTo: 'impact',
    title: 'Chimerical impact',
    description: 'Impact with no outcomes rolling up to it — we hope it will just happen.',
    fix: 'Connect at least one outcome to this impact, or break it into child impacts, so there is a plan for how it gets achieved.',
  },
  {
    id: 'unvalidated-outcome',
    emoji: '🔮',
    appliesTo: 'outcome',
    title: 'Unvalidated outcome',
    description: 'Outcome with little evidence behind it — not enough insights connected.',
    fix: 'Connect at least one insight that supports this outcome, or reconsider whether it is the right thing to chase.',
  },
  {
    id: 'chimerical-outcome',
    emoji: '👻',
    appliesTo: 'outcome',
    title: 'Chimerical outcome',
    description: 'Outcome with no projects connected and nothing narrowing it further — we hope it will magically happen.',
    fix: 'Connect a project that drives this outcome, or break it into child outcomes that projects can drive.',
  },
  {
    id: 'whats-the-point',
    emoji: '🤷',
    appliesTo: 'project',
    title: "What's the point? project",
    description: "Project that doesn't roll up to any outcome.",
    fix: 'Connect this project to the outcome it drives, or question whether the work is worth doing.',
  },
];

export const ruleById = (id) => RULES.find((rule) => rule.id === id);

const same = (a, b) => a != null && b != null && String(a) === String(b);

// Which rules each node in the tree breaks. Returns
// { impact, outcome, project: Map<id, rule[]> }; nodes that break
// nothing are absent from the maps.
export function validateTree({ outcomes, projects, insights = [], impacts = [] }) {
  const present = new Set(outcomes.map((outcome) => String(outcome.id)));
  // Same notion of root as the tree layout: no parent, or a parent that is
  // filtered out or stale, so what is drawn as a root is judged as one.
  const isRoot = (outcome) =>
    outcome.parent_outcome_id == null || !present.has(String(outcome.parent_outcome_id));

  const result = { impact: new Map(), outcome: new Map(), project: new Map() };
  const flag = (kind, entity, rule) => {
    if (!result[kind].has(entity.id)) result[kind].set(entity.id, []);
    result[kind].get(entity.id).push(rule);
  };

  // An impact is carried by outcomes driving it, or by child impacts that
  // narrow it further.
  for (const impact of impacts) {
    const childImpacts = impacts.filter((candidate) => same(candidate.parent_impact_id, impact.id));
    if (childImpacts.length === 0 && outcomesForImpact(outcomes, impact).length === 0) {
      flag('impact', impact, ruleById('chimerical-impact'));
    }
  }

  for (const outcome of outcomes) {
    const childOutcomes = outcomes.filter(
      (candidate) => !isRoot(candidate) && same(candidate.parent_outcome_id, outcome.id)
    );
    if (insightsForOutcome(insights, outcome).length < MIN_INSIGHTS) {
      flag('outcome', outcome, ruleById('unvalidated-outcome'));
    }
    // An outcome broken into child outcomes is carried by them; only one at
    // the bottom needs a project of its own.
    if (childOutcomes.length === 0 && projectsForOutcome(projects, outcome).length === 0) {
      flag('outcome', outcome, ruleById('chimerical-outcome'));
    }
  }

  for (const project of projects) {
    if (outcomesForProject(outcomes, project).length === 0) {
      flag('project', project, ruleById('whats-the-point'));
    }
  }

  return result;
}

export const issuesFor = (validation, kind, entity) => validation[kind].get(entity.id) ?? [];

// Entities per rule, for the legend counts and the issues page.
export function groupByRule(validation, { impacts = [], outcomes, projects }) {
  return RULES.map((rule) => {
    const kind = rule.appliesTo;
    const pool = { impact: impacts, outcome: outcomes, project: projects }[kind];
    const items = pool.filter((entity) => issuesFor(validation, kind, entity).includes(rule));
    return { rule, items };
  });
}
