import { z } from 'zod';
import { api } from '../client.js';
import { id, text, path, update, registerReadAndDelete } from './shared.js';

const date = z.string().describe('ISO 8601 date or timestamp');

export function registerProjectTools(server) {
  registerReadAndDelete(server, {
    collection: 'projects',
    singular: 'project',
    idField: 'project_id',
    listDescription:
      'List every project in the account, each with the ids of the outcomes it drives (outcome_ids). Projects nest via parent_project_id.',
  });

  server.registerTool(
    'create_project',
    {
      title: 'Create project',
      description:
        'Create a project: a bounded body of work whose output (a feature, migration, process change…) drives outcomes.',
      inputSchema: {
        name: z.string().min(1).describe('The thing being built or done, e.g. "Invite modal in onboarding"'),
        description: z.string().optional(),
        team_id: id.optional().describe('The one team running the project. Omit when not known yet; assign one later.'),
        parent_project_id: id.optional().describe('Optional parent project'),
        outcome_ids: z.array(id).optional().describe('Outcomes this project drives'),
        start_at: date.optional(),
        end_at: date.optional(),
      },
    },
    async (args) => text(await api('/projects', { method: 'POST', body: args }))
  );

  server.registerTool(
    'update_project',
    {
      title: 'Update project',
      description:
        'Update a project. Applies only the fields you pass. outcome_ids, when passed, replaces the full set of linked outcomes.',
      inputSchema: {
        project_id: id,
        name: z.string().min(1).optional(),
        description: z.string().nullable().optional().describe('Pass null to clear'),
        team_id: id.nullable().optional().describe('Pass null to clear'),
        parent_project_id: id.nullable().optional().describe('Pass null to make top-level'),
        outcome_ids: z.array(id).optional().describe('The complete new set of linked outcomes'),
        start_at: date.nullable().optional().describe('Pass null to clear'),
        end_at: date.nullable().optional().describe('Pass null to clear'),
      },
      annotations: { idempotentHint: true },
    },
    async ({ project_id, ...changes }) =>
      text(
        await update(path('projects', project_id), changes, [
          'name',
          'description',
          'team_id',
          'parent_project_id',
          'outcome_ids',
          'start_at',
          'end_at',
        ])
      )
  );
}
