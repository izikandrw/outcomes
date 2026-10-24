import { z } from 'zod';
import { api } from '../client.js';
import { id, text, path, update, registerReadAndDelete } from './shared.js';

const date = z.string().describe('ISO 8601 date or timestamp');

export function registerTargetTools(server) {
  registerReadAndDelete(server, {
    collection: 'targets',
    singular: 'target',
    idField: 'target_id',
    listDescription:
      'List every target in the account. Each belongs to one outcome or impact and carries latest_value, latest_measured_at and measurement_count.',
  });

  server.registerTool(
    'create_target',
    {
      title: 'Create target',
      description:
        'Put numbers on an outcome or an impact: what is counted (unit), where it starts (baseline_value) and where it has to get to (target_value). Pass exactly one of outcome_id or impact_id. Give a due_at.',
      inputSchema: {
        outcome_id: id.optional(),
        impact_id: id.optional(),
        unit: z.string().min(1).describe('What is counted, e.g. "admins inviting in first session"'),
        baseline_value: z.number().describe('The reading when the team decided to move it'),
        target_value: z.number(),
        baseline_at: date.optional().describe('When the baseline was read; defaults to now'),
        due_at: date.optional(),
        name: z.string().optional().describe('Only needed to tell several targets on one parent apart'),
        description: z.string().optional(),
      },
    },
    async (args) => text(await api('/targets', { method: 'POST', body: args }))
  );

  server.registerTool(
    'update_target',
    {
      title: 'Update target',
      description:
        'Revise a target. Applies only the fields you pass. The baseline records what the team believed when it started, so change it deliberately.',
      inputSchema: {
        target_id: id,
        unit: z.string().min(1).optional(),
        baseline_value: z.number().optional(),
        target_value: z.number().optional(),
        baseline_at: date.optional(),
        due_at: date.nullable().optional().describe('Pass null to clear'),
        name: z.string().nullable().optional().describe('Pass null to clear'),
        description: z.string().nullable().optional().describe('Pass null to clear'),
      },
      annotations: { idempotentHint: true },
    },
    async ({ target_id, ...changes }) =>
      text(
        await update(path('targets', target_id), changes, [
          'outcome_id',
          'impact_id',
          'unit',
          'baseline_value',
          'target_value',
          'baseline_at',
          'due_at',
          'name',
          'description',
        ])
      )
  );
}

export function registerMeasurementTools(server) {
  server.registerTool(
    'list_measurements',
    {
      title: 'List measurements',
      description:
        "List measurements (readings on a target), oldest first. Pass target_id for one target's progress series.",
      inputSchema: { target_id: id.optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ target_id }) => {
      const all = await api('/measurements');
      const series = target_id === undefined ? all : all.filter((m) => String(m.target_id) === String(target_id));
      series.sort((a, b) => new Date(a.measured_at) - new Date(b.measured_at) || a.id - b.id);
      return text(series);
    }
  );

  server.registerTool(
    'record_measurement',
    {
      title: 'Record measurement',
      description: 'Record a reading on a target. The unit comes from the target.',
      inputSchema: {
        target_id: id,
        value: z.number(),
        measured_at: date.optional().describe('When the reading applies; defaults to now'),
      },
    },
    async (args) => text(await api('/measurements', { method: 'POST', body: args }))
  );

  server.registerTool(
    'update_measurement',
    {
      title: 'Update measurement',
      description: 'Correct a bad reading. Applies only the fields you pass.',
      inputSchema: {
        measurement_id: id,
        value: z.number().optional(),
        measured_at: date.optional(),
      },
      annotations: { idempotentHint: true },
    },
    async ({ measurement_id, ...changes }) =>
      text(await update(path('measurements', measurement_id), changes, ['target_id', 'value', 'measured_at']))
  );

  server.registerTool(
    'delete_measurement',
    {
      title: 'Delete measurement',
      description: 'Permanently delete a measurement by id.',
      inputSchema: { measurement_id: id },
      annotations: { destructiveHint: true },
    },
    async ({ measurement_id }) => {
      await api(path('measurements', measurement_id), { method: 'DELETE' });
      return text({ deleted: String(measurement_id) });
    }
  );
}
