import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { collect } from '../src/collect.js';
import { csvDocuments, parseCsv } from '../src/connectors/csv.js';
import { textDocument } from '../src/connectors/text.js';

const USAGE = { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };

test('parseCsv handles quoted commas, quotes, newlines, CRLF and a BOM', () => {
  const rows = parseCsv('﻿a,b\r\n"x, y","he said ""hi"""\r\n"two\nlines",z\r\n\r\n');
  assert.deepEqual(rows, [['a', 'b'], ['x, y', 'he said "hi"'], ['two\nlines', 'z']]);
});

test('csvDocuments makes a document per row, with its cells as column: value lines', () => {
  const text = readFileSync(new URL('../samples/feedback-log.csv', import.meta.url), 'utf8');
  const documents = csvDocuments(text, { fileName: 'feedback-log.csv' });
  assert.equal(documents.length, 10);
  const [first] = documents;
  assert.equal(first.external_id, 'feedback-log.csv · row 1');
  assert.equal(first.source_system, 'csv');
  assert.equal(first.customer, 'Globex');
  assert.equal(first.occurred_at, '2026-10-02');
  assert.match(first.text, /^date: 2026-10-02\ncustomer: Globex\nchannel: renewal call\n/);

  const byId = csvDocuments('Key,Text,Link\nPROD-1,broken,https://x/PROD-1\n', { fileName: 'jira.csv', sourceSystem: 'jira' });
  assert.equal(byId[0].external_id, 'PROD-1');
  assert.equal(byId[0].url, 'https://x/PROD-1');
  assert.throws(() => csvDocuments('a,b\n1,2\n', { fileName: 'f.csv', columns: { date: 'when' } }), /no column "when"/);
  assert.equal(csvDocuments('a,b\n1,2\n', { fileName: 'f.csv', unit: 'file' })[0].external_id, 'f.csv');
});

test('textDocument makes one document per file', () => {
  const doc = textDocument('  [14:20] Customer: hi \n', { fileName: 'globex-call.txt', sourceSystem: 'attention' });
  assert.deepEqual([doc.external_id, doc.title, doc.text], ['globex-call.txt', 'globex-call', '[14:20] Customer: hi']);
});

const DOCS = [
  { source_system: 'csv', external_id: 'f.csv · row 1', title: null, occurred_at: '2026-10-02', url: null, text: 'feedback: we gave up on SSO after two days' },
  { source_system: 'csv', external_id: 'f.csv · row 2', title: null, occurred_at: null, url: null, text: 'feedback: Thanks, that fixed it!' },
  { source_system: 'csv', external_id: 'f.csv · row 3', title: null, occurred_at: null, url: null, text: 'feedback: invites go to spam' },
  { source_system: 'csv', external_id: 'f.csv · row 4', title: null, occurred_at: null, url: null, text: 'feedback: exports time out' },
];

const candidate = (excerpt) => ({
  name: `About: ${excerpt}`,
  description: null,
  excerpt,
  type: 'support_ticket',
  sentiment: 'negative',
  firsthand: true,
  dollar_impact: null,
  dollar_impact_basis: null,
});

// Extract answers by document; row 3's excerpt was already collected, and row
// 4's call fails. Link always picks outcome 12 and invents outcome 99.
function fakeClient() {
  const answers = {
    'row 1': [candidate('we gave up on SSO after two days'), candidate('made up')],
    'row 2': [],
    'row 3': [candidate('invites go to spam')],
  };
  return {
    messages: {
      async parse(params) {
        const content = params.messages[0].content;
        if (params.system.length === 2) {
          return { stop_reason: 'end_turn', usage: USAGE, parsed_output: { links: [{ kind: 'outcome', id: '12', rationale: 'r' }, { kind: 'outcome', id: '99', rationale: 'r' }], proposed: [] } };
        }
        if (content.includes('row 4')) throw Object.assign(new Error('overloaded'), { status: 529 });
        const row = Object.keys(answers).find((key) => content.includes(key));
        return { stop_reason: 'end_turn', usage: USAGE, parsed_output: { insights: answers[row] } };
      },
    },
  };
}

function fakeApi() {
  const calls = [];
  let nextId = 100;
  const api = async (path, { method = 'GET', body } = {}) => {
    calls.push({ path, method, body });
    if (path === '/outcomes') return [{ id: 12, name: 'Admins finish SSO setup', description: null }];
    if (path === '/projects') return [];
    if (path === '/insights' && method === 'GET') {
      return [{ id: 7, status: 'rejected', source_system: 'csv', source_external_id: 'f.csv · row 3', source_excerpt: 'Invites go to  spam' }];
    }
    if (path === '/collection-runs') return { id: 5 };
    if (path === '/insights') return { id: nextId++ };
    return {};
  };
  return { api, calls };
}

test('collect suggests verified insights, skips what was collected, and traces every document', async () => {
  const { api, calls } = fakeApi();
  const { run, report, errors } = await collect(DOCS, { api, client: fakeClient(), sourceName: 'f.csv', unit: 'one row', model: 'claude-opus-5-5', effort: 'high', concurrency: 2 });
  assert.equal(run.id, 5);
  assert.deepEqual(report.map((entry) => entry.decision), ['suggested', 'no_insight', 'already_collected']);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].external_id, 'f.csv · row 4');

  const posts = calls.filter((call) => call.method === 'POST');
  assert.equal(posts[0].path, '/collection-runs');
  assert.equal(posts[0].body.prompt_version, 'pipeline v2');

  const suggestions = posts.filter((call) => call.path === '/insights');
  assert.equal(suggestions.length, 1);
  const [suggestion] = suggestions;
  assert.equal(suggestion.body.status, 'unvalidated');
  assert.equal(suggestion.body.source_excerpt, 'we gave up on SSO after two days');
  assert.equal(suggestion.body.observed_at, '2026-10-02');
  assert.deepEqual(suggestion.body.outcome_ids, ['12']);
  assert.deepEqual(suggestion.body.link_rationales, { outcomes: { 12: 'r' }, projects: {} });
  assert.equal(suggestion.body.collection_run_id, 5);

  const documents = posts.filter((call) => call.path === '/collection-runs/5/documents');
  assert.deepEqual(documents.map((call) => call.body.external_id), ['f.csv · row 1', 'f.csv · row 2', 'f.csv · row 3']);
  assert.deepEqual(documents[0].body.insight_ids, [100]);
  assert.match(documents[0].body.reason, /dropped 1 whose excerpt isn't in the document/);
  assert.match(documents[1].body.reason, /^The extractor found no insight/);

  const finish = posts.find((call) => call.path === '/collection-runs/5/finish');
  assert.equal(finish.body.status, 'succeeded');
  assert.match(finish.body.summary, /Failed on 1, not recorded/);
});

test('a 409 from the API counts as already collected, and a dry run writes nothing', async () => {
  const { api, calls } = fakeApi();
  const conflicting = async (path, options = {}) => {
    if (path === '/insights' && options.method === 'POST') throw new Error('duplicate value');
    return api(path, options);
  };
  const { report } = await collect(DOCS.slice(0, 1), { api: conflicting, client: fakeClient(), model: 'claude-opus-5-5' });
  assert.equal(report[0].decision, 'already_collected');

  calls.length = 0;
  const dry = await collect(DOCS.slice(0, 3), { api, client: fakeClient(), model: 'claude-opus-5-5', dryRun: true });
  assert.equal(dry.run, null);
  assert.deepEqual(dry.report.map((entry) => entry.decision), ['suggested', 'no_insight', 'already_collected']);
  assert.ok(calls.every((call) => call.method === 'GET'));
});
