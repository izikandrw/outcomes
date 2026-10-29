import { z } from 'zod';
import { api } from '../client.js';
import { id, text, path, registerReadAndDelete } from './shared.js';

const fields = {
  name: z.string().min(1).describe('The behavior change, e.g. "Admins invite a teammate in their first session". Not a thing to build.'),
  description: z.string().optional().describe('Optional detail'),
  team_id: id.describe('Team accountable for the outcome'),
  project_id: id.optional().describe("Optional home project"),
  project_ids: z.array(id).optional().describe('Projects that drive this outcome'),
  parent_outcome_id: id.optional().describe('Optional parent outcome; omit for a top-level outcome'),
  impact_id: id
    .optional()
    .describe('The business impact this outcome drives. Only top-level outcomes carry it; children inherit it from their top-level ancestor.'),
};

export function registerOutcomeTools(server) {
  registerReadAndDelete(server, {
    collection: 'outcomes',
    singular: 'outcome',
    idField: 'outcome_id',
    listDescription: 'List every outcome in the account, each with the ids of projects linked to it (project_ids).',
  });

  server.registerTool(
    'create_outcome',
    {
      title: 'Create outcome',
      description: 'Create an outcome: a change in user or agent behavior that drives a business result.',
      inputSchema: fields,
    },
    async (args) => text(await api('/outcomes', { method: 'POST', body: args }))
  );

  server.registerTool(
    'update_outcome',
    {
      title: 'Update outcome',
      description:
        'Update an outcome. The API replaces the whole record, so this fetches the current outcome and applies only the fields you pass. project_ids, when passed, replaces the full set of linked projects.',
      inputSchema: {
        outcome_id: id,
        name: fields.name.optional(),
        description: z.string().nullable().optional().describe('Pass null to clear'),
        team_id: id.optional(),
        project_id: id.nullable().optional().describe('Pass null to clear'),
        project_ids: z.array(id).optional().describe('The complete new set of linked projects'),
        parent_outcome_id: id.nullable().optional().describe('Pass null to make top-level'),
        impact_id: id.nullable().optional().describe('Top-level outcomes only. Pass null to clear'),
      },
      annotations: { idempotentHint: true },
    },
    async ({ outcome_id, ...changes }) => {
      const outcomePath = path('outcomes', outcome_id);
      const current = await api(outcomePath);
      const { name, description, team_id, project_id, parent_outcome_id, impact_id } = { ...current, ...changes };
      // Only a top-level outcome may link to an impact, so nesting an outcome
      // drops the link it carried. An impact_id passed explicitly is sent as-is
      // and the API rejects it on a child.
      const impact = changes.impact_id !== undefined ? impact_id : parent_outcome_id ? null : impact_id;
      return text(
        await api(outcomePath, {
          method: 'PUT',
          // project_ids is only sent when passed; omitting it leaves the links alone.
          body: { name, description, team_id, project_id, project_ids: changes.project_ids, parent_outcome_id, impact_id: impact },
        })
      );
    }
  );
}
