import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runEval } from '../src/evals/run.js';
import { runDocument } from '../src/pipeline/index.js';
import { callModel, costOf } from '../src/pipeline/model.js';
import { z } from 'zod/v4';
import Anthropic from '@anthropic-ai/sdk';

const DOC = { source_system: 'attention', external_id: 'Globex call', text: 'Priya: Honestly we gave up on SSO after two days.\nRep: I think SSO is confusing.' };
const CATALOG = { outcomes: [{ id: '12', name: 'Admins finish SSO setup', description: null }], projects: [] };
const USAGE = { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 50, cache_creation_input_tokens: 0 };

// Stands in for the Anthropic client: answers extract and link calls by which
// schema they ask for, and records every request.
function fakeClient({ extracted, links = [], stop = 'end_turn' }) {
  const calls = [];
  return {
    calls,
    messages: {
      async parse(params) {
        calls.push(params);
        const isLink = params.system.length === 2;
        return {
          stop_reason: stop,
          usage: USAGE,
          parsed_output: isLink ? { links, proposed: [] } : { insights: extracted },
        };
      },
    },
  };
}

const candidate = (excerpt) => ({
  name: 'Globex abandoned SSO setup',
  description: null,
  excerpt,
  type: 'sales_call',
  sentiment: 'negative',
  firsthand: true,
  dollar_impact: null,
  dollar_impact_basis: null,
});

test('callModel sends effort and a cached prefix, and turns a refusal into a ModelOutputError', async () => {
  const client = fakeClient({ extracted: [] });
  await callModel(client, { model: 'claude-opus-5-5', effort: 'high', system: ['a', 'b'], user: 'u', schema: z.object({ insights: z.array(z.string()) }) });
  const [params] = client.calls;
  assert.equal(params.output_config.effort, 'high');
  assert.equal(params.system[0].cache_control, undefined);
  assert.deepEqual(params.system[1].cache_control, { type: 'ephemeral' });

  const refusing = fakeClient({ extracted: [], stop: 'refusal' });
  await assert.rejects(
    callModel(refusing, { system: ['a'], user: 'u', schema: z.object({ insights: z.array(z.string()) }) }),
    (err) => err.kind === 'refusal',
  );
});

test('runDocument verifies excerpts before linking, and drops links to ids outside the catalog', async () => {
  const client = fakeClient({
    extracted: [candidate('we gave up on SSO after two days'), candidate('we hated SSO')],
    links: [{ kind: 'outcome', id: '12', rationale: 'r' }, { kind: 'outcome', id: '99', rationale: 'made up' }],
  });
  const out = await runDocument(client, DOC, CATALOG, { model: 'claude-opus-5-5' });
  assert.equal(out.insights.length, 1);
  assert.deepEqual(out.insights[0].links.map((l) => l.id), ['12']);
  assert.deepEqual(out.drops.map((d) => d.reason), ['excerpt_not_in_document', 'unknown_catalog_id']);
  // One extract call and one link call: the made-up excerpt never reached the linker.
  assert.equal(client.calls.length, 2);
  assert.equal(out.usage.input, 200);
});

test('runEval scores each rep, links the gold insights too, and keeps failed runs out of the scores', async () => {
  const cases = [
    {
      name: 'globex',
      label_source: 'golden',
      split: 'dev',
      document: DOC,
      expected: { insights: [{ excerpt: 'we gave up on SSO after two days', name: 'g', firsthand: true, links: [{ kind: 'outcome', id: '12' }] }] },
    },
    { name: 'empty', label_source: 'review', split: 'dev', document: { text: 'Thanks!' }, expected: { insights: [] } },
  ];
  const client = fakeClient({ extracted: [candidate('we gave up on SSO after two days')], links: [{ kind: 'outcome', id: '12', rationale: 'r' }] });
  // The empty document's extract call fails with an API error (overloaded).
  const flaky = {
    messages: {
      parse: (params) => (params.messages[0].content.includes('Thanks!') ? Promise.reject(Object.assign(Object.create(Anthropic.APIError.prototype), { status: 529, message: 'overloaded' })) : client.messages.parse(params)),
    },
  };
  const { results, errors, summary } = await runEval(cases, { client: flaky, catalog: CATALOG, model: 'claude-opus-5-5', effort: 'high', reps: 2, concurrency: 2 });
  assert.equal(results.length, 2);
  assert.equal(errors.length, 2);
  assert.equal(errors[0].status, 529);
  assert.equal(summary.groups.all.precision.mean, 1);
  assert.equal(summary.groups.all.gold_link_precision.mean, 1);
  assert.equal(summary.groups.review, undefined);
  assert.equal(summary.groups.all.fabricated_excerpts.mean, 0);
  assert.ok(summary.cost > 0);
});

test('costOf prices known models and leaves unknown ones unpriced', () => {
  assert.equal(costOf('claude-opus-5-5', { input: 1e6, output: 0, cache_read: 0, cache_write: 0 }), 4);
  assert.equal(costOf('some-other-model', { input: 1, output: 1, cache_read: 0, cache_write: 0 }), null);
});

test('each case is linked against its own frozen catalog unless liveCatalog is set', async () => {
  const frozen = { outcomes: [{ id: '12', name: 'Admins finish SSO setup', description: null }], projects: [] };
  const today = { outcomes: [], projects: [] };
  const cases = [
    {
      name: 'globex',
      label_source: 'golden',
      split: 'dev',
      document: DOC,
      catalog: frozen,
      expected: { insights: [{ excerpt: 'we gave up on SSO after two days', name: 'g', links: [{ kind: 'outcome', id: '12' }] }] },
    },
  ];
  const run = (liveCatalog) =>
    runEval(cases, {
      client: fakeClient({ extracted: [candidate('we gave up on SSO after two days')], links: [{ kind: 'outcome', id: '12', rationale: 'r' }] }),
      catalog: today,
      liveCatalog,
      model: 'claude-opus-5-5',
      effort: 'high',
      reps: 1,
    });
  // Frozen: outcome 12 is in the case's catalog, so the link stands.
  assert.equal((await run(false)).summary.groups.all.link_recall.mean, 1);
  // Live: today's catalog has no outcome 12, so the link is dropped as unknown.
  assert.equal((await run(true)).summary.groups.all.link_recall.mean, 0);
});
