import { z } from 'zod';
import { api } from '../client.js';

export const id = z.union([z.string(), z.number()]).describe('Numeric id');

export const text = (value) => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });

export const path = (collection, itemId) => `/${collection}/${encodeURIComponent(itemId)}`;

// The API's PUTs replace the whole record, so fetch the current one, apply only
// the fields the caller passed, and send back every field in `writable`.
export async function update(itemPath, changes, writable) {
  const merged = { ...(await api(itemPath)), ...changes };
  const body = Object.fromEntries(writable.map((field) => [field, merged[field]]));
  return api(itemPath, { method: 'PUT', body });
}

// Registers list/get/delete for a collection; create and update differ enough
// per resource to stay explicit. `listFilters` (a zod shape) become optional
// query-string parameters on the list tool.
export function registerReadAndDelete(server, { collection, singular, idField, listDescription, listFilters }) {
  server.registerTool(
    `list_${collection}`,
    {
      title: `List ${collection}`,
      description: listDescription,
      ...(listFilters ? { inputSchema: listFilters } : {}),
      annotations: { readOnlyHint: true },
    },
    async (args = {}) => {
      const query = new URLSearchParams(
        Object.entries(args).filter(([key, value]) => listFilters?.[key] && value !== undefined)
      ).toString();
      return text(await api(`/${collection}${query ? `?${query}` : ''}`));
    }
  );

  server.registerTool(
    `get_${singular}`,
    {
      title: `Get ${singular}`,
      description: `Get one ${singular} by id.`,
      inputSchema: { [idField]: id },
      annotations: { readOnlyHint: true },
    },
    async (args) => text(await api(path(collection, args[idField])))
  );

  server.registerTool(
    `delete_${singular}`,
    {
      title: `Delete ${singular}`,
      description: `Permanently delete a ${singular} by id.`,
      inputSchema: { [idField]: id },
      annotations: { destructiveHint: true },
    },
    async (args) => {
      await api(path(collection, args[idField]), { method: 'DELETE' });
      return text({ deleted: String(args[idField]) });
    }
  );
}
