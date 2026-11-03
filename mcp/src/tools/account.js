import { z } from 'zod';
import { api, API_URL } from '../client.js';
import { saveCollectorLogin } from '../collectorLogin.js';
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

  server.registerTool(
    'create_collector_login',
    {
      title: 'Create collector login',
      description:
        "Create the signed-in account's insight collector login, which can only read and suggest insights. Needs an admin. " +
        'The password is saved to a private file and never returned; the result gives the file and a command that registers the collector MCP server from it. ' +
        'Fails if the account already has a collector, unless replace is true.',
      inputSchema: {
        replace: z
          .boolean()
          .optional()
          .describe('Issue a new password for an existing collector. This signs out whatever uses the current one, so ask the user first.'),
      },
      annotations: { destructiveHint: true, idempotentHint: false },
    },
    async ({ replace }) => {
      const login = await api('/collector', { method: 'POST', body: { replace: replace === true } });
      return text(await saveCollectorLogin(login, { apiUrl: API_URL }));
    }
  );
}
