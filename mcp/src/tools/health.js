import { z } from 'zod';
import { api } from '../client.js';
import { text } from './shared.js';

// "Are we working on the right things?" from product/jtbds/delivery.md, read
// from the list endpoints. Links roll up through nesting: a parent counts as
// covered when any of its descendants is, and a child project counts as having
// a point when any of its ancestors drives an outcome.

const key = (value) => (value == null ? null : String(value));

// `rootIds` plus the ids of all their descendants, given a child -> parent field.
function withDescendants(rootIds, all, parentField) {
  const found = new Set(rootIds);
  for (let grew = true; grew; ) {
    grew = false;
    for (const item of all) {
      const parent = key(item[parentField]);
      if (parent && found.has(parent) && !found.has(key(item.id))) {
        found.add(key(item.id));
        grew = true;
      }
    }
  }
  return found;
}

const summary = ({ id, name, team_id }) => ({ id: key(id), name, ...(team_id !== undefined ? { team_id: key(team_id) } : {}) });

export function registerHealthTools(server) {
  server.registerTool(
    'review_portfolio',
    {
      title: 'Review portfolio',
      description:
        'Answer "are we working on the right things?" Flags chimerical impacts (no outcomes roll up to them), unvalidated outcomes (too few insights), chimerical outcomes (no projects drive them) and pointless projects (roll up to no outcome). Nesting counts: a parent is covered by its descendants.',
      inputSchema: {
        min_insights: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe('Insights an outcome needs, counting its descendants, to not be flagged unvalidated. Default 1.'),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ min_insights = 1 }) => {
      const [impacts, outcomes, projects, insights] = await Promise.all(
        ['/impacts', '/outcomes', '/projects', '/insights'].map((p) => api(p))
      );

      const subtree = (outcome) => withDescendants([key(outcome.id)], outcomes, 'parent_outcome_id');

      const impactsWithOutcomes = new Set(outcomes.map((o) => key(o.impact_id)).filter(Boolean));
      const chimericalImpacts = impacts.filter((impact) => {
        const ids = withDescendants([key(impact.id)], impacts, 'parent_impact_id');
        return ![...ids].some((i) => impactsWithOutcomes.has(i));
      });

      const outcomesWithProjects = new Set(outcomes.filter((o) => o.project_ids.length > 0).map((o) => key(o.id)));
      const insightsByOutcome = new Map();
      for (const insight of insights) {
        for (const outcomeId of insight.outcome_ids) {
          if (!insightsByOutcome.has(key(outcomeId))) insightsByOutcome.set(key(outcomeId), []);
          insightsByOutcome.get(key(outcomeId)).push(key(insight.id));
        }
      }
      const unvalidatedOutcomes = [];
      const chimericalOutcomes = [];
      for (const outcome of outcomes) {
        const ids = [...subtree(outcome)];
        // Distinct, since one insight can back both an outcome and its child.
        const evidence = new Set(ids.flatMap((i) => insightsByOutcome.get(i) ?? [])).size;
        if (evidence < min_insights) unvalidatedOutcomes.push({ ...summary(outcome), insight_count: evidence });
        if (!ids.some((i) => outcomesWithProjects.has(i))) chimericalOutcomes.push(summary(outcome));
      }

      const byId = new Map(projects.map((p) => [key(p.id), p]));
      const hasPoint = (project, seen = new Set()) => {
        if (project.outcome_ids.length > 0) return true;
        const parent = byId.get(key(project.parent_project_id));
        if (!parent || seen.has(key(parent.id))) return false;
        seen.add(key(parent.id));
        return hasPoint(parent, seen);
      };
      const pointlessProjects = projects.filter((p) => !hasPoint(p));

      return text({
        counts: {
          impacts: impacts.length,
          outcomes: outcomes.length,
          projects: projects.length,
          insights: insights.length,
        },
        chimerical_impacts: chimericalImpacts.map(summary),
        unvalidated_outcomes: unvalidatedOutcomes,
        chimerical_outcomes: chimericalOutcomes,
        pointless_projects: pointlessProjects.map(summary),
      });
    }
  );
}
