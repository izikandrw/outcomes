import { z } from 'zod';
import { api } from '../client.js';
import { id, text, path, update, registerReadAndDelete } from './shared.js';

export function registerTeamTools(server) {
  registerReadAndDelete(server, {
    collection: 'teams',
    singular: 'team',
    idField: 'team_id',
    listDescription:
      'List every team in the account. Teams nest via parent_team_id; outcomes, projects and insights hang off a team.',
  });

  server.registerTool(
    'create_team',
    {
      title: 'Create team',
      description: 'Create a team: the unit of accountability for outcomes and projects.',
      inputSchema: {
        name: z.string().min(1),
        parent_team_id: id.optional().describe('Optional parent team, usually a group or department'),
      },
    },
    async (args) => text(await api('/teams', { method: 'POST', body: args }))
  );

  server.registerTool(
    'update_team',
    {
      title: 'Update team',
      description: 'Update a team. Applies only the fields you pass; the logo is kept.',
      inputSchema: {
        team_id: id,
        name: z.string().min(1).optional(),
        parent_team_id: id.nullable().optional().describe('Pass null to make top-level'),
      },
      annotations: { idempotentHint: true },
    },
    async ({ team_id, ...changes }) =>
      text(await update(path('teams', team_id), changes, ['name', 'parent_team_id', 'logo']))
  );
}
