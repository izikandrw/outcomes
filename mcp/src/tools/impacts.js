import { z } from 'zod';
import { api } from '../client.js';
import { id, text, path, update, registerReadAndDelete } from './shared.js';

export function registerImpactTools(server) {
  registerReadAndDelete(server, {
    collection: 'impacts',
    singular: 'impact',
    idField: 'impact_id',
    deleteNote:
      ' Its targets and their readings are deleted with it. Child impacts, linked outcomes and linked projects are kept and just lose the link to it.',
    listDescription:
      'List every impact (business result) in the account. Impacts nest via parent_impact_id; top-level outcomes link to them via impact_id.',
  });

  server.registerTool(
    'create_impact',
    {
      title: 'Create impact',
      description:
        'Create an impact: the business result we want, e.g. "Grow revenue 20% this year". Put the numbers on it with create_target.',
      inputSchema: {
        name: z.string().min(1),
        description: z.string().optional(),
        parent_impact_id: id.optional().describe('Optional parent impact, e.g. a revenue goal split by segment'),
      },
    },
    async (args) => text(await api('/impacts', { method: 'POST', body: args }))
  );

  server.registerTool(
    'update_impact',
    {
      title: 'Update impact',
      description: 'Update an impact. Applies only the fields you pass.',
      inputSchema: {
        impact_id: id,
        name: z.string().min(1).optional(),
        description: z.string().nullable().optional().describe('Pass null to clear'),
        parent_impact_id: id.nullable().optional().describe('Pass null to make top-level'),
      },
      annotations: { idempotentHint: true },
    },
    async ({ impact_id, ...changes }) =>
      text(await update(path('impacts', impact_id), changes, ['name', 'description', 'parent_impact_id']))
  );
}
