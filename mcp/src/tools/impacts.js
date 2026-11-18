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
      'List every impact (business result: revenue up or costs down) in the account. Impacts nest via parent_impact_id; top-level outcomes link to them via impact_id.',
  });

  server.registerTool(
    'create_impact',
    {
      title: 'Create impact',
      description:
        'Create an impact: a result that grows the business, revenue up or costs down, counted in money or a direct proxy (ARR, net revenue retention, win rate, churned revenue, support cost). E.g. "Grow revenue 20% this year", "Cut support cost per account 15%". ' +
        'Not an impact: a change in what customers do ("Admins invite a teammate in their first session" is an outcome; create it with create_outcome under the impact it drives), or something the team ships, funds or adopts ("Launch the public API" is a project). ' +
        'If a candidate doesn\'t move revenue or cost by itself, ask what business result it leads to and make that the impact. Put the numbers on it with create_target.',
      inputSchema: {
        name: z.string().min(1).describe('The business result, e.g. "Grow enterprise ARR 20%". Not a customer behavior or a deliverable.'),
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
