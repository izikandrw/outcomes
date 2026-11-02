// A collection run (design.md §2): SourceDocument[] → the pipeline for each one
// → dedupe → suggestions in the review queue, with a run trace (§6) recording
// every document read, so its runs show up under Review → Runs exactly like
// the collect-insights skill's and feed the eval set the same way.
import { runDocument } from './pipeline/index.js';
import { normalise } from './pipeline/verify.js';
import { addUsage, costOf, NO_USAGE } from './pipeline/model.js';
import { PROMPT_VERSION } from './prompts/index.js';

// The catalog the linker may link to, read fresh at the start of each run.
export async function loadCatalog(api) {
  const pick = (rows) => rows.map(({ id, name, description }) => ({ id: String(id), name, description }));
  const [outcomes, projects] = await Promise.all([api('/outcomes'), api('/projects')]);
  return { outcomes: pick(outcomes), projects: pick(projects) };
}

// Dedupe (§2.4): the same excerpt from the same source document, whatever
// became of it in review, rejected included. The API's unique index backs this
// up with a 409.
const dedupeKey = (sourceSystem, externalId, excerpt) => [sourceSystem, externalId, normalise(excerpt)].join('\u0000');

async function collectedKeys(api) {
  const insights = await api('/insights');
  return new Set(
    insights
      .filter((insight) => insight.source_system && insight.source_excerpt)
      .map((insight) => dedupeKey(insight.source_system, insight.source_external_id, insight.source_excerpt)),
  );
}

// The request suggest_insight sends (mcp/src/tools/insights.js).
export function suggestionBody(document, insight, runId) {
  const pick = (kind) => insight.links.filter((entry) => entry.kind === kind);
  const rationales = (kind) => Object.fromEntries(pick(kind).map((entry) => [entry.id, entry.rationale]));
  return {
    name: insight.name,
    description: insight.description ?? undefined,
    type: insight.type,
    sentiment: insight.sentiment,
    firsthand: insight.firsthand,
    observed_at: document.occurred_at ?? undefined,
    dollar_impact: insight.dollar_impact ?? undefined,
    status: 'unvalidated',
    source: `${document.source_system}: ${document.external_id}`,
    source_system: document.source_system,
    source_external_id: document.external_id,
    source_url: document.url ?? undefined,
    source_excerpt: insight.excerpt,
    outcome_ids: pick('outcome').map((entry) => entry.id),
    project_ids: pick('project').map((entry) => entry.id),
    link_rationales: { outcomes: rationales('outcome'), projects: rationales('project') },
    proposed_links: insight.proposed,
    collection_run_id: runId,
  };
}

const DROP_REASONS = {
  excerpt_not_in_document: (n) => `dropped ${n} whose excerpt isn't in the document`,
  duplicate_excerpt: (n) => `dropped ${n} repeating an excerpt`,
  dollar_basis_not_in_document: (n) => `cleared ${n} dollar figure${n === 1 ? '' : 's'} the document doesn't state`,
  dollar_figure_not_in_basis: (n) => `cleared ${n} dollar figure${n === 1 ? '' : 's'} that didn't match the text cited for ${n === 1 ? 'it' : 'them'}`,
  unknown_catalog_id: (n) => `dropped ${n} link${n === 1 ? '' : 's'} to ids not in the catalog`,
};

// The trace's one-sentence reason, from what the code saw: the pipeline makes
// no claim about why a document held nothing.
function reasonFor({ candidateCount, drops }, suggested, skipped) {
  const parts = [];
  if (candidateCount === 0) parts.push('The extractor found no insight');
  else parts.push(`The extractor found ${candidateCount} candidate${candidateCount === 1 ? '' : 's'}`);
  const counts = {};
  for (const drop of drops) counts[drop.reason] = (counts[drop.reason] ?? 0) + 1;
  for (const [reason, n] of Object.entries(counts)) parts.push(DROP_REASONS[reason]?.(n) ?? `${reason} × ${n}`);
  if (skipped > 0) parts.push(`skipped ${skipped} already collected`);
  if (suggested > 0) parts.push(`suggested ${suggested}`);
  return `${parts.join('; ')}.`;
}

// options: { api, client, sourceName, unit, model, effort, concurrency,
// dryRun, onDocument }. With dryRun nothing is written: no run, no
// suggestions, only what it would have done. Returns the run (null on a dry
// run), one entry per document, the errors and the token usage.
export async function collect(documents, options) {
  const { api, client, sourceName, unit, model, effort, concurrency = 4, dryRun = false, onDocument } = options;
  const sourceSystem = documents[0]?.source_system;
  if (!sourceSystem) throw new Error('no documents to collect from');

  const catalog = await loadCatalog(api);
  const collected = await collectedKeys(api);
  const run = dryRun
    ? null
    : await api('/collection-runs', {
        method: 'POST',
        body: { source_system: sourceSystem, source_name: sourceName, unit, model, prompt_version: PROMPT_VERSION },
      });

  const report = [];
  const errors = [];
  let usage = NO_USAGE;

  // Documents run `concurrency` at a time and are written in order, so the
  // trace reads like the source.
  async function write(document, output) {
    const ids = [];
    let skipped = 0;
    for (const insight of output.insights) {
      const key = dedupeKey(document.source_system, document.external_id, insight.excerpt);
      if (collected.has(key)) {
        skipped += 1;
        continue;
      }
      collected.add(key);
      if (dryRun) {
        ids.push(null);
        continue;
      }
      try {
        const created = await api('/insights', { method: 'POST', body: suggestionBody(document, insight, run.id) });
        ids.push(created.id);
      } catch (err) {
        if (err.message !== 'duplicate value') throw err;
        skipped += 1;
      }
    }
    const decision = ids.length > 0 ? 'suggested' : skipped > 0 ? 'already_collected' : 'no_insight';
    const reason = reasonFor(output, ids.length, skipped);
    if (!dryRun) {
      await api(`/collection-runs/${run.id}/documents`, {
        method: 'POST',
        body: { external_id: document.external_id, title: document.title ?? undefined, text: document.text, decision, reason, insight_ids: ids },
      });
    }
    const entry = { external_id: document.external_id, decision, reason, suggested: ids.length, skipped, insights: output.insights, drops: output.drops };
    report.push(entry);
    onDocument?.(entry);
  }

  try {
    for (let start = 0; start < documents.length; start += concurrency) {
      const batch = documents.slice(start, start + concurrency);
      const outputs = await Promise.allSettled(batch.map((document) => runDocument(client, document, catalog, { model, effort })));
      for (const [i, settled] of outputs.entries()) {
        const document = batch[i];
        if (settled.status === 'rejected') {
          const err = settled.reason;
          // A model failure leaves the document out of the trace; re-running
          // the source picks it up, since what was suggested is skipped.
          errors.push({ external_id: document.external_id, kind: err.kind ?? err.constructor?.name ?? 'Error', message: err.message });
          onDocument?.({ external_id: document.external_id, error: err.message });
          continue;
        }
        usage = addUsage(usage, settled.value.usage);
        await write(document, settled.value);
      }
    }
  } catch (err) {
    if (run) await finish(api, run, { status: 'failed', summary: summarise(report, errors, usage, model), error: err.message });
    throw err;
  }

  const allFailed = documents.length > 0 && errors.length === documents.length;
  if (run) {
    await finish(api, run, {
      status: allFailed ? 'failed' : 'succeeded',
      summary: summarise(report, errors, usage, model),
      error: allFailed ? `every document failed, e.g. ${errors[0].message}` : undefined,
    });
  }
  return { run, report, errors, usage, cost: costOf(model, usage) };
}

async function finish(api, run, body) {
  await api(`/collection-runs/${run.id}/finish`, { method: 'POST', body });
}

// The run's summary, as the skill's report: counts, proposals, failures, cost.
export function summarise(report, errors, usage, model) {
  const count = (decision) => report.filter((entry) => entry.decision === decision).length;
  const suggested = report.reduce((total, entry) => total + entry.suggested, 0);
  const excerptDrops = report.flatMap((entry) => entry.drops).filter((drop) => drop.reason === 'excerpt_not_in_document').length;
  const unlinked = report.flatMap((entry) => entry.insights).filter((insight) => insight.links.length === 0).length;
  const proposals = {};
  for (const insight of report.flatMap((entry) => entry.insights)) {
    for (const proposal of insight.proposed) {
      const name = `${proposal.kind}: ${proposal.name}`;
      proposals[name] = (proposals[name] ?? 0) + 1;
    }
  }
  const cost = costOf(model, usage);
  const lines = [
    `${PROMPT_VERSION} on ${model}. Read ${report.length + errors.length} documents: ${count('suggested')} with suggestions, ${count('no_insight')} with no insight, ${count('already_collected')} already collected.`,
    `Suggested ${suggested} insights (${unlinked} unlinked); dropped ${excerptDrops} whose excerpt didn't verify.`,
  ];
  if (Object.keys(proposals).length > 0) {
    lines.push(`Proposed: ${Object.entries(proposals).map(([name, n]) => `${name} (${n})`).join('; ')}.`);
  }
  if (errors.length > 0) {
    lines.push(`Failed on ${errors.length}, not recorded (re-run to retry): ${errors.map((e) => `${e.external_id} (${e.kind}: ${e.message})`).join('; ')}.`);
  }
  lines.push(`Tokens: ${usage.input} in, ${usage.output} out, ${usage.cache_read} cache read${cost === null ? '' : `; about $${cost.toFixed(2)}`}.`);
  return lines.join('\n');
}
