import { z } from 'zod';
import { api } from '../client.js';
import { text } from './shared.js';
import { logo, toLogo } from './logo.js';

// The signed-in user's account: its name and the logo shown in the header,
// account menu and invite screen. api('') is the account itself.
export function registerAccountTools(server) {
  server.registerTool(
    'get_account',
    {
      title: 'Get account',
      description: 'Get the signed-in account: its id, name and logo.',
      annotations: { readOnlyHint: true },
    },
    async () => text(await api(''))
  );

  server.registerTool(
    'update_account',
    {
      title: 'Update account',
      description:
        'Rename the signed-in account or set its logo. Applies only the fields you pass; leaving out logo keeps the current one. Needs an admin.',
      inputSchema: {
        name: z.string().min(1).optional(),
        logo,
      },
      annotations: { idempotentHint: true },
    },
    async ({ name, logo: source }) => {
      const body = { name: name ?? (await api('')).name };
      if (source !== undefined) body.logo = await toLogo(source);
      return text(await api('', { method: 'PUT', body }));
    }
  );
}
