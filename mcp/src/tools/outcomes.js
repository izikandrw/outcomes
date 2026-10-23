import { z } from 'zod';
import { api } from '../client.js';

const id = z.union([z.string(), z.number()]).describe('Numeric id');

const fields = {
  name: z.string().min(1).describe('The behavior change, e.g. "Admins invite a teammate in their first session". Not a thing to build.'),
  description: z.string().optional().describe('Optional detail'),
  team_id: id.describe('Team accountable for the outcome'),
  project_id: id.optional().describe("Optional home project"),
  parent_outcome_id: id.optional().describe('Optional parent outcome; omit for a top-level outcome'),
};

const text = (value) => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });

export function registerOutcomeTools(server) {
  server.registerTool(
    'list_outcomes',
    {
      title: 'List outcomes',
      description: 'List every outcome in the account, each with the ids of projects linked to it (project_ids).',
      annotations: { readOnlyHint: true },
    },
    async () => text(await api('/outcomes'))
  );

  server.registerTool(
    'get_outcome',
    {
      title: 'Get outcome',
      description: 'Get one outcome by id.',
      inputSchema: { outcome_id: id },
      annotations: { readOnlyHint: true },
    },
    async ({ outcome_id }) => text(await api(`/outcomes/${encodeURIComponent(outcome_id)}`))
  );

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
        'Update an outcome. The API replaces the whole record, so this fetches the current outcome and applies only the fields you pass.',
      inputSchema: {
        outcome_id: id,
        name: fields.name.optional(),
        description: z.string().nullable().optional().describe('Pass null to clear'),
        team_id: id.optional(),
        project_id: id.nullable().optional().describe('Pass null to clear'),
        parent_outcome_id: id.nullable().optional().describe('Pass null to make top-level'),
      },
      annotations: { idempotentHint: true },
    },
    async ({ outcome_id, ...changes }) => {
      const path = `/outcomes/${encodeURIComponent(outcome_id)}`;
      const current = await api(path);
      const { name, description, team_id, project_id, parent_outcome_id, impact_id } = { ...current, ...changes };
      // The PUT replaces the record, so carry the impact link through. Only a
      // top-level outcome may have one; nesting an outcome drops it.
      return text(
        await api(path, {
          method: 'PUT',
          body: { name, description, team_id, project_id, parent_outcome_id, impact_id: parent_outcome_id ? null : impact_id },
        })
      );
    }
  );

  server.registerTool(
    'delete_outcome',
    {
      title: 'Delete outcome',
      description: 'Permanently delete an outcome by id.',
      inputSchema: { outcome_id: id },
      annotations: { destructiveHint: true },
    },
    async ({ outcome_id }) => {
      await api(`/outcomes/${encodeURIComponent(outcome_id)}`, { method: 'DELETE' });
      return text({ deleted: String(outcome_id) });
    }
  );
}
