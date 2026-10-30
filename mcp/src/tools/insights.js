import { z } from 'zod';
import { api } from '../client.js';
import { id, text, path, update, registerReadAndDelete } from './shared.js';

// Mirrors TYPES, IMPACT_AREAS and SENTIMENTS in src/routes/insights.js.
const type = z.enum([
  'support_ticket', 'session_recording', 'interview', 'funnel', 'experiment',
  'sales_call', 'feature_request', 'survey', 'review', 'other',
]);
const impactArea = z.enum(['acquisition', 'activation', 'retention', 'expansion', 'cost', 'other']);
const sentiment = z
  .enum(['positive', 'neutral', 'negative'])
  .describe('Whether the observation is good news (praise, success), bad news (a complaint, pain, churn risk) or neither for the customer');

const fields = {
  name: z
    .string()
    .min(1)
    .describe(
      'The observation, specific enough to check, e.g. "11 of 14 interviewed admins abandoned setup at the SSO step". Not a conclusion.'
    ),
  type: type.optional().describe('Kind of evidence; defaults to other'),
  description: z.string().optional(),
  source: z.string().optional().describe('Where to check it: a link, ticket id, call timestamp, file and row'),
  observed_at: z
    .string()
    .optional()
    .describe('Date the observation was made: YYYY-MM-DD, or a full ISO 8601 timestamp. A month or year alone is rejected'),
  dollar_impact: z.number().optional().describe('Money the observation represents, only when the source states it'),
  impact_area: impactArea.optional(),
  sentiment: sentiment.optional(),
  team_id: id.optional().describe('Team that recorded it'),
  outcome_ids: z.array(id).optional().describe('Outcomes this is evidence for'),
  project_ids: z.array(id).optional().describe('Projects this is evidence for'),
};

const WRITABLE = Object.keys(fields);

export function registerInsightTools(server) {
  registerReadAndDelete(server, {
    collection: 'insights',
    singular: 'insight',
    idField: 'insight_id',
    listDescription:
      'List insights in the account, each with the outcomes and projects it is evidence for (outcome_ids, project_ids), its status, its sentiment (positive, neutral or negative) and, for suggestions, where it came from (source_system, source_external_id, source_excerpt). Only validated insights are evidence.',
    listFilters: {
      status: z
        .enum(['unvalidated', 'validated', 'rejected'])
        .optional()
        .describe('Only insights with this status. Omit for all.'),
    },
  });

  server.registerTool(
    'create_insight',
    {
      title: 'Create insight',
      description:
        'Record an insight a person has asked you to record: a single, sourced observation that is evidence an outcome or project is worth pursuing. It counts as evidence straight away. For an insight you found yourself in a source document, use suggest_insight instead.',
      inputSchema: fields,
    },
    async (args) => text(await api('/insights', { method: 'POST', body: args }))
  );

  // The insight collector's write path (product/agents/insight-collector/).
  // Everything it creates waits in the review queue as unvalidated, carries the
  // verbatim excerpt it rests on, and says why each link was made.
  server.registerTool(
    'suggest_insight',
    {
      title: 'Suggest insight',
      description:
        'Suggest an insight you found in a source document. It goes to the review queue as unvalidated and is not evidence until a person approves it. ' +
        'Suggesting the same excerpt from the same source document twice, or one a reviewer already rejected, is skipped.',
      inputSchema: {
        name: fields.name,
        description: z.string().optional().describe('Context: who, how many, what happened'),
        type,
        observed_at: fields.observed_at,
        dollar_impact: fields.dollar_impact,
        impact_area: impactArea.optional(),
        sentiment,
        source_system: z.string().min(1).describe('Where it came from: csv, google_sheets, attention, jira, ...'),
        source_external_id: z
          .string()
          .min(1)
          .describe('Finds the original within that system, stable across runs: "file.csv · row 12", "PROD-2291", "Globex call · 14:20"'),
        source_url: z.string().optional().describe('Link to the original, when there is one'),
        source_excerpt: z
          .string()
          .min(1)
          .describe('The exact words from the source the insight rests on, copied character for character. Never paraphrased.'),
        firsthand: z
          .boolean()
          .describe("True if the excerpt is a customer's own words or actions, including words quoted verbatim in someone's notes; false if it is someone else's paraphrase"),
        links: z
          .array(
            z.object({
              kind: z.enum(['outcome', 'project']),
              id,
              rationale: z.string().min(1).describe('One sentence: why this insight is evidence for it'),
            })
          )
          .max(3)
          .optional()
          .describe('Up to 3 outcomes or projects this is evidence for. Empty when nothing fits.'),
        proposed_links: z
          .array(
            z.object({
              kind: z.enum(['outcome', 'project']),
              name: z
                .string()
                .min(1)
                .describe('Named like the catalog\'s outcomes or projects, e.g. "Cut image size so customers pay less for egress"'),
              description: z.string().optional().describe('One or two sentences: what it would cover'),
              rationale: z.string().min(1).describe('One sentence: why this insight is evidence for it'),
            })
          )
          .max(3)
          .optional()
          .describe(
            'Outcomes or projects that do not exist yet but that this insight is direct evidence for, only when nothing in the catalog covers it. ' +
              'Never created by you: a reviewer creates one and links the insight to it, or dismisses it.'
          ),
        collection_run_id: id.optional().describe('The run this suggestion belongs to (start_collection_run)'),
      },
    },
    async ({ links = [], proposed_links = [], ...insight }) => {
      const pick = (kind) => links.filter((link) => link.kind === kind);
      const rationales = (kind) => Object.fromEntries(pick(kind).map((link) => [link.id, link.rationale]));
      try {
        return text(
          await api('/insights', {
            method: 'POST',
            body: {
              ...insight,
              status: 'unvalidated',
              source: `${insight.source_system}: ${insight.source_external_id}`,
              outcome_ids: pick('outcome').map((link) => link.id),
              project_ids: pick('project').map((link) => link.id),
              link_rationales: { outcomes: rationales('outcome'), projects: rationales('project') },
              proposed_links,
            },
          })
        );
      } catch (err) {
        // The API's unique index on (source, excerpt) answers 409 "duplicate value".
        if (err.message === 'duplicate value') {
          return text({ skipped: 'already suggested from this source, or rejected before', source_external_id: insight.source_external_id });
        }
        throw err;
      }
    }
  );

  server.registerTool(
    'update_insight',
    {
      title: 'Update insight',
      description:
        'Update an insight. Applies only the fields you pass. outcome_ids and project_ids, when passed, replace the full set of links.',
      inputSchema: {
        insight_id: id,
        name: fields.name.optional(),
        type: type.optional(),
        description: z.string().nullable().optional().describe('Pass null to clear'),
        source: z.string().nullable().optional().describe('Pass null to clear'),
        observed_at: z.string().nullable().optional().describe('YYYY-MM-DD or a full ISO 8601 timestamp. Pass null to clear'),
        dollar_impact: z.number().nullable().optional().describe('Pass null to clear'),
        impact_area: impactArea.nullable().optional().describe('Pass null to clear'),
        sentiment: sentiment.nullable().optional(),
        team_id: id.nullable().optional().describe('Pass null to clear'),
        outcome_ids: fields.outcome_ids,
        project_ids: fields.project_ids,
      },
      annotations: { idempotentHint: true },
    },
    async ({ insight_id, ...changes }) => text(await update(path('insights', insight_id), changes, WRITABLE))
  );
}
