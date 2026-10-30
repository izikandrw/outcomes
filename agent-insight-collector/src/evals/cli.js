#!/usr/bin/env node
// npm --prefix agent-insight-collector run eval -- [options]
//
// Scores the insight collector's pipeline against the eval set
// (product/agents/insight-collector/evals.md). Cases are the ready ones from
// the app's Review → Eval set, read through the API as a person (the collector
// may not read them; set OUTCOMES_API_URL and OUTCOMES_API_TOKEN, or
// OUTCOMES_EMAIL and OUTCOMES_PASSWORD, as for mcp/), or a file saved with
// Download ready cases. The model is called with ANTHROPIC_API_KEY (or an
// `ant auth login` profile).
//
//   --split dev|test|all     which split to score (default dev)
//   --set golden|review|all  which set (default all)
//   --case <name>            one case only
//   --limit <n>              the first n cases
//   --reps <n>               runs per case (default 3)
//   --model <id>             default claude-opus-5-5
//   --effort <level>         low|medium|high|xhigh|max (default high)
//   --concurrency <n>        documents in flight (default 4)
//   --no-gold-links          skip running the linker on the gold insights
//   --file <eval-set.json>   cases from a downloaded file instead of the API
//   --live-catalog           link against today's outcomes and projects, not each case's frozen catalog
//   --catalog <file>         { outcomes, projects } for --live-catalog, or for cases without a catalog
//   --baseline <dir>         compare with this results dir (default: the last run of the same split)
//   --show-test-failures     list failures even on the test split
//   --self-check             grade the expected answers themselves (no model calls)
//
// Writes agent-insight-collector/evals/results/<time>-<prompt version>-<model>-<effort>/:
// results.jsonl, errors.jsonl, summary.json and summary.md.
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { PROMPT_VERSION } from '../prompts/index.js';
import { DEFAULT_EFFORT, DEFAULT_MODEL, NO_USAGE } from '../pipeline/model.js';
import { runEval } from './run.js';
import { summaryMarkdown } from './report.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = path.resolve(here, '../../evals/results');

const { values: args } = parseArgs({
  options: {
    split: { type: 'string', default: 'dev' },
    set: { type: 'string', default: 'all' },
    case: { type: 'string' },
    limit: { type: 'string' },
    reps: { type: 'string', default: '3' },
    model: { type: 'string', default: DEFAULT_MODEL },
    effort: { type: 'string', default: DEFAULT_EFFORT },
    concurrency: { type: 'string', default: '4' },
    'no-gold-links': { type: 'boolean', default: false },
    file: { type: 'string' },
    catalog: { type: 'string' },
    'live-catalog': { type: 'boolean', default: false },
    baseline: { type: 'string' },
    'show-test-failures': { type: 'boolean', default: false },
    'self-check': { type: 'boolean', default: false },
  },
});

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

async function apiClient() {
  const { api } = await import('../../../mcp/src/client.js');
  return api;
}

async function loadCases() {
  if (args.file) return readJson(args.file);
  const api = await apiClient();
  try {
    return await api('/eval-cases?status=ready');
  } catch (err) {
    throw new Error(`couldn't read the eval set from the API (${err.message}). Sign in as a person, not the collector, or pass --file.`);
  }
}

async function loadCatalog() {
  if (args.catalog) return readJson(args.catalog);
  const api = await apiClient();
  const pick = (rows) => rows.map(({ id, name, description }) => ({ id: String(id), name, description }));
  const [outcomes, projects] = await Promise.all([api('/outcomes'), api('/projects')]);
  return { outcomes: pick(outcomes), projects: pick(projects) };
}

function chooseCases(all) {
  let cases = all.filter((c) => (c.status ?? 'ready') === 'ready');
  if (args.split !== 'all') cases = cases.filter((c) => c.split === args.split);
  if (args.set !== 'all') cases = cases.filter((c) => c.label_source === args.set);
  if (args.case) cases = cases.filter((c) => c.name === args.case);
  if (args.limit) cases = cases.slice(0, Number(args.limit));
  return cases;
}

// The newest earlier run of the same split, unless --baseline names one.
function findBaseline() {
  if (args.baseline) return path.resolve(args.baseline);
  if (!existsSync(RESULTS_DIR)) return null;
  const dirs = readdirSync(RESULTS_DIR)
    .filter((name) => !name.endsWith('-self-check') && existsSync(path.join(RESULTS_DIR, name, 'summary.json')))
    .sort()
    .reverse();
  for (const name of dirs) {
    const summary = readJson(path.join(RESULTS_DIR, name, 'summary.json'));
    const catalogMode = args['live-catalog'] ? 'live' : 'frozen';
    if (summary.split === args.split && summary.sets === args.set && (summary.catalog ?? 'frozen') === catalogMode) {
      return path.join(RESULTS_DIR, name);
    }
  }
  return null;
}

const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// --self-check: the expected answers as the prediction should score 1 on
// everything, and an empty prediction 0 recall but 1 on empty documents. If
// not, the grader has a bug (evals.md, "The runner" step 6).
async function selfCheck(cases) {
  const asGold = (c) => ({ insights: c.expected.insights ?? [], drops: [], candidateCount: (c.expected.insights ?? []).length, usage: NO_USAGE });
  const asEmpty = () => ({ insights: [], drops: [], candidateCount: 0, usage: NO_USAGE });
  const common = { model: 'self-check', effort: '-', reps: 1, goldLinks: false };
  const gold = (await runEval(cases, { ...common, predict: asGold })).summary.groups.all;
  const empty = (await runEval(cases, { ...common, predict: asEmpty })).summary.groups.all;
  const mean = (metrics, key) => metrics[key]?.mean ?? null;
  const checks = [
    ['gold: precision', mean(gold, 'precision'), (v) => v === null || v === 1],
    ['gold: recall', mean(gold, 'recall'), (v) => v === null || v === 1],
    ['gold: empty-doc accuracy', mean(gold, 'empty_doc_accuracy'), (v) => v === null || v === 1],
    ['gold: link precision', mean(gold, 'link_precision'), (v) => v === null || v === 1],
    ['gold: firsthand', mean(gold, 'firsthand_accuracy'), (v) => v === null || v === 1],
    ['gold: known non-insights suggested', mean(gold, 'known_non_insights_suggested'), (v) => v === 0],
    ['empty: recall', mean(empty, 'recall'), (v) => v === null || v === 0],
    ['empty: empty-doc accuracy', mean(empty, 'empty_doc_accuracy'), (v) => v === null || v === 1],
  ];
  let ok = true;
  for (const [label, value, pass] of checks) {
    const passed = pass(value);
    ok &&= passed;
    console.log(`${passed ? 'ok  ' : 'FAIL'} ${label}: ${value === null ? 'n/a' : value}`);
  }
  console.log(ok ? `Grader self-check passed on ${cases.length} cases.` : 'Grader self-check FAILED: fix the grader before trusting any score.');
  process.exitCode = ok ? 0 : 1;
}

async function main() {
  const cases = chooseCases(await loadCases());
  if (cases.length === 0) {
    console.error(`No ready cases in split ${args.split}, set ${args.set}. Mark cases ready on Review → Eval set.`);
    process.exitCode = 1;
    return;
  }
  if (args['self-check']) return selfCheck(cases);

  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ maxRetries: 4 });
  // Each case brings the catalog it was labelled against; today's is only
  // needed to test against it, or for cases from before catalogs were frozen.
  const needsCatalog = args['live-catalog'] || cases.some((c) => !c.catalog);
  const catalog = needsCatalog ? await loadCatalog() : null;
  const startedAt = new Date().toISOString();
  console.log(`Scoring ${cases.length} cases × ${args.reps} reps on ${args.model} (effort ${args.effort}), ${PROMPT_VERSION}…`);

  const { results, errors, summary } = await runEval(cases, {
    client,
    catalog,
    liveCatalog: args['live-catalog'],
    model: args.model,
    effort: args.effort,
    reps: Number(args.reps),
    concurrency: Number(args.concurrency),
    goldLinks: !args['no-gold-links'],
    onProgress: (done, total) => process.stdout.write(`\r${done}/${total} runs`),
  });
  process.stdout.write('\n');

  const record = {
    ...summary,
    prompt_version: PROMPT_VERSION,
    split: args.split,
    sets: args.set,
    catalog: args['live-catalog'] ? 'live' : 'frozen',
    started_at: startedAt,
    cases: cases.map((c) => c.name),
  };
  const baselineDir = findBaseline();
  const previous = baselineDir ? readJson(path.join(baselineDir, 'summary.json')) : null;
  const outDir = path.join(RESULTS_DIR, `${startedAt.replace(/[:.]/g, '-')}-${slug(PROMPT_VERSION)}-${args.model}-${args.effort}`);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, 'results.jsonl'), results.map((r) => JSON.stringify(r)).join('\n') + '\n');
  writeFileSync(path.join(outDir, 'errors.jsonl'), errors.map((e) => JSON.stringify(e)).join('\n') + (errors.length ? '\n' : ''));
  writeFileSync(path.join(outDir, 'summary.json'), `${JSON.stringify(record, null, 2)}\n`);
  const markdown = summaryMarkdown(summary, previous, {
    promptVersion: PROMPT_VERSION,
    split: args.split,
    sets: args.set,
    catalog: args['live-catalog'] ? 'today’s (--live-catalog)' : 'each case’s frozen one',
    caseCount: cases.length,
    startedAt,
    previousName: baselineDir ? path.basename(baselineDir) : null,
    showFailures: args.split !== 'test' || args['show-test-failures'],
  }, results, errors);
  writeFileSync(path.join(outDir, 'summary.md'), markdown);
  console.log(markdown);
  console.log(`Saved to ${outDir}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
