#!/usr/bin/env node
// npm run collect -- <file>... [options]
//
// Collects insights from files into the review queue with the v1 pipeline
// (product/agents/insight-collector/design.md §2): one run per invocation,
// traced under Review → Runs. Signs in like mcp/: set OUTCOMES_API_URL and
// OUTCOMES_EMAIL + OUTCOMES_PASSWORD to the collector user `npm run collector`
// prints (or OUTCOMES_API_TOKEN). The model is called with ANTHROPIC_API_KEY.
//
// A .csv file is read by the CSV connector, one row per document; anything
// else is one document per file (a call transcript, interview notes).
//
//   --source <system>        source_system: csv (default for .csv), attention, jira, …; required for other files
//   --unit row|file          for CSV: one row per document (default) or the whole file
//   --id-column <name>       a stable id per row (default: a column named id or key, else "<file> · row N")
//   --date-column <name>     when it happened (default: date, created, timestamp…)
//   --customer-column <name> who (default: customer, company, account…)
//   --url-column <name>      link to the original (default: url, link)
//   --title-column <name>    (default: title, summary, subject)
//   --limit <n>              the first n documents only
//   --model <id>             default claude-opus-5-5
//   --effort <level>         low|medium|high|xhigh|max (default high)
//   --concurrency <n>        documents in flight (default 4)
//   --dry-run                run the pipeline and print what it would suggest; write nothing
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { csvDocuments } from './connectors/csv.js';
import { textDocument } from './connectors/text.js';
import { DEFAULT_EFFORT, DEFAULT_MODEL } from './pipeline/model.js';
import { PROMPT_VERSION } from './prompts/index.js';
import { collect } from './collect.js';

const { values: args, positionals: files } = parseArgs({
  allowPositionals: true,
  options: {
    source: { type: 'string' },
    unit: { type: 'string', default: 'row' },
    'id-column': { type: 'string' },
    'date-column': { type: 'string' },
    'customer-column': { type: 'string' },
    'url-column': { type: 'string' },
    'title-column': { type: 'string' },
    limit: { type: 'string' },
    model: { type: 'string', default: DEFAULT_MODEL },
    effort: { type: 'string', default: DEFAULT_EFFORT },
    concurrency: { type: 'string', default: '4' },
    'dry-run': { type: 'boolean', default: false },
  },
});

function readDocuments() {
  if (files.length === 0) throw new Error('name at least one file: npm run collect -- feedback.csv');
  const isCsv = (file) => path.extname(file).toLowerCase() === '.csv';
  if (files.some(isCsv) && !files.every(isCsv)) throw new Error('collect CSVs and other files in separate runs');
  const sourceSystem = args.source ?? (isCsv(files[0]) ? 'csv' : null);
  if (!sourceSystem) throw new Error('say where these files came from with --source, e.g. --source attention');
  const documents = files.flatMap((file) => {
    const text = readFileSync(file, 'utf8');
    const fileName = path.basename(file);
    if (!isCsv(file)) return [textDocument(text, { fileName, sourceSystem })];
    return csvDocuments(text, {
      fileName,
      sourceSystem,
      unit: args.unit,
      columns: {
        id: args['id-column'],
        date: args['date-column'],
        customer: args['customer-column'],
        url: args['url-column'],
        title: args['title-column'],
      },
    });
  });
  return args.limit ? documents.slice(0, Number(args.limit)) : documents;
}

const unitOf = () => {
  if (path.extname(files[0]).toLowerCase() !== '.csv') return 'one file';
  return args.unit === 'file' ? 'the whole CSV file' : 'one CSV row, every cell as a "column: value" line';
};

async function main() {
  const documents = readDocuments();
  const { api } = await import('../../mcp/src/client.js');
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ maxRetries: 4 });
  const dryRun = args['dry-run'];
  console.log(`${dryRun ? 'Dry run: ' : ''}collecting from ${documents.length} documents with ${PROMPT_VERSION} on ${args.model} (effort ${args.effort})…`);

  const { run, report, errors, cost } = await collect(documents, {
    api,
    client,
    sourceName: files.map((file) => path.basename(file)).join(', '),
    unit: unitOf(),
    model: args.model,
    effort: args.effort,
    concurrency: Number(args.concurrency),
    dryRun,
    onDocument: (entry) => {
      if (entry.error) return console.log(`✗ ${entry.external_id}: ${entry.error}`);
      console.log(`${entry.decision === 'suggested' ? '+' : '·'} ${entry.external_id}: ${entry.decision}. ${entry.reason}`);
      for (const insight of entry.insights) {
        const links = insight.links.map((l) => `${l.kind} ${l.id}`).join(', ') || 'unlinked';
        const proposed = insight.proposed.map((p) => `new ${p.kind} "${p.name}"`).join(', ');
        console.log(`    "${insight.name}" (${insight.sentiment}, ${insight.firsthand ? 'firsthand' : 'relayed'}; ${links}${proposed ? `; ${proposed}` : ''})`);
      }
    },
  });

  const suggested = report.reduce((total, entry) => total + entry.suggested, 0);
  console.log(
    `\n${dryRun ? 'Would suggest' : 'Suggested'} ${suggested} insights from ${report.length} documents` +
      `${errors.length ? `; ${errors.length} failed (re-run to retry)` : ''}${cost === null ? '' : `; about $${cost.toFixed(2)}`}.`,
  );
  if (run) console.log(`Run ${run.id}. Review them on the Review page; the trace is under Review → Runs.`);
  if (errors.length > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
