import { z } from 'zod';
import { api } from '../client.js';
import { id, text, path, update, registerReadAndDelete } from './shared.js';

// Mirrors TYPES and IMPACT_AREAS in src/routes/insights.js.
const type = z.enum(['support_ticket', 'session_recording', 'interview', 'funnel', 'experiment', 'other']);
const impactArea = z.enum(['acquisition', 'activation', 'retention', 'expansion', 'cost', 'other']);

const fields = {
  name: z
    .string()
    .min(1)
    .describe(
      'The observation, specific enough to check, e.g. "11 of 14 interviewed admins abandoned setup at the SSO step". Not a conclusion.'
    ),
  type: type.optional().describe('Kind of evidence; defaults to other'),
  description: z.string().optional(),
  source: z.string().optional().describe('Where to check it: a link, ticket id, call timestamp, file and row'),
  observed_at: z.string().optional().describe('ISO 8601 date the observation was made'),
  dollar_impact: z.number().optional().describe('Money the observation represents, only when the source states it'),
  impact_area: impactArea.optional(),
  team_id: id.optional().describe('Team that recorded it'),
  outcome_ids: z.array(id).optional().describe('Outcomes this is evidence for'),
  project_ids: z.array(id).optional().describe('Projects this is evidence for'),
};

const WRITABLE = Object.keys(fields);

export function registerInsightTools(server) {
  registerReadAndDelete(server, {
    collection: 'insights',
    singular: 'insight',
    idField: 'insight_id',
    listDescription:
      'List every insight in the account, each with the outcomes and projects it is evidence for (outcome_ids, project_ids).',
  });

  server.registerTool(
    'create_insight',
    {
      title: 'Create insight',
      description:
        'Record an insight: a single, sourced observation that is evidence an outcome or project is worth pursuing.',
      inputSchema: fields,
    },
    async (args) => text(await api('/insights', { method: 'POST', body: args }))
  );

  server.registerTool(
    'update_insight',
    {
      title: 'Update insight',
      description:
        'Update an insight. Applies only the fields you pass. outcome_ids and project_ids, when passed, replace the full set of links.',
      inputSchema: {
        insight_id: id,
        name: fields.name.optional(),
        type: type.optional(),
        description: z.string().nullable().optional().describe('Pass null to clear'),
        source: z.string().nullable().optional().describe('Pass null to clear'),
        observed_at: z.string().nullable().optional().describe('Pass null to clear'),
        dollar_impact: z.number().nullable().optional().describe('Pass null to clear'),
        impact_area: impactArea.nullable().optional().describe('Pass null to clear'),
        team_id: id.nullable().optional().describe('Pass null to clear'),
        outcome_ids: fields.outcome_ids,
        project_ids: fields.project_ids,
      },
      annotations: { idempotentHint: true },
    },
    async ({ insight_id, ...changes }) => text(await update(path('insights', insight_id), changes, WRITABLE))
  );
}
