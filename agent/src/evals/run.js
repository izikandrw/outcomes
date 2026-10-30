// Runs eval cases through the pipeline and grades them
// (product/agents/insight-collector/evals.md, "The runner"): each case `reps`
// times, since output varies run to run; infrastructure failures kept out of
// the scores; the linker also run on the gold insights, so link scores don't
// swing with extraction. `predict` stands in for the pipeline in --self-check.
import { runDocument, link } from '../pipeline/index.js';
import { normalise } from '../pipeline/verify.js';
import { addUsage, costOf, NO_USAGE } from '../pipeline/model.js';
import { aggregate, aggregateGoldLinks, scoreCase, scoreLinks } from './score.js';

const GROUPS = ['all', 'golden', 'review'];

async function pool(items, concurrency, work) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      while (queue.length > 0) await work(queue.shift());
    }),
  );
}

// options: { client, catalog, liveCatalog, model, effort, reps, concurrency,
// goldLinks, predict?, onProgress? }. Each case is linked against the catalog
// frozen with it, so its expected links and the model's choices match;
// `catalog` stands in for cases without one, or for all of them with
// liveCatalog. Returns per-run results, errors and the summary.
export async function runEval(cases, options) {
  const { client, catalog, liveCatalog = false, model, effort, reps = 3, concurrency = 4, goldLinks = true, predict, onProgress } = options;
  const jobs = cases.flatMap((evalCase) => Array.from({ length: reps }, (_, rep) => ({ evalCase, rep })));
  const results = [];
  const errors = [];
  let usage = NO_USAGE;
  let done = 0;

  await pool(jobs, concurrency, async ({ evalCase, rep }) => {
    const started = Date.now();
    const caseCatalog = (!liveCatalog && evalCase.catalog) || catalog;
    try {
      const output = predict
        ? await predict(evalCase)
        : await runDocument(client, evalCase.document, caseCatalog, { model, effort });
      let runUsage = output.usage;
      const goldLinkScores = [];
      if (goldLinks && !predict) {
        for (const gold of evalCase.expected.insights ?? []) {
          if (!Array.isArray(gold.links)) continue;
          const linked = await link(client, gold, caseCatalog, { model, effort });
          runUsage = addUsage(runUsage, linked.usage);
          goldLinkScores.push(scoreLinks(linked.links, gold.links));
        }
      }
      const text = normalise(evalCase.document.text);
      results.push({
        case: evalCase.name,
        label_source: evalCase.label_source,
        split: evalCase.split,
        rep,
        insights: output.insights,
        drops: output.drops,
        candidate_count: output.candidateCount,
        // Should be impossible past the verify step; counted to prove it.
        fabricated_excerpts: output.insights.filter((insight) => !text.includes(normalise(insight.excerpt))).length,
        score: scoreCase(evalCase, output.insights),
        gold_links: goldLinkScores,
        usage: runUsage,
        cost: costOf(model, runUsage),
        ms: Date.now() - started,
      });
      usage = addUsage(usage, runUsage);
    } catch (err) {
      errors.push({ case: evalCase.name, rep, kind: err.kind ?? err.constructor?.name ?? 'Error', status: err.status ?? null, message: err.message });
    }
    done += 1;
    onProgress?.(done, jobs.length);
  });

  return { results, errors, summary: summarise(results, errors, { model, effort, reps, usage }) };
}

// Each metric per group (all / golden / review): the mean over reps, and the
// lowest and highest rep, since a change smaller than that spread isn't real.
export function summarise(results, errors, { model, effort, reps, usage }) {
  const groups = {};
  for (const group of GROUPS) {
    const inGroup = results.filter((r) => group === 'all' || r.label_source === group);
    if (inGroup.length === 0) continue;
    const perRep = [];
    for (let rep = 0; rep < reps; rep++) {
      const runs = inGroup.filter((r) => r.rep === rep);
      if (runs.length === 0) continue;
      const totalCandidates = runs.reduce((total, r) => total + r.candidate_count, 0);
      const excerptDrops = runs.reduce((total, r) => total + r.drops.filter((d) => d.reason === 'excerpt_not_in_document').length, 0);
      perRep.push({
        ...aggregate(runs.map((r) => r.score)),
        ...aggregateGoldLinks(runs.flatMap((r) => r.gold_links)),
        fabricated_excerpts: runs.reduce((total, r) => total + r.fabricated_excerpts, 0),
        verify_drop_rate: totalCandidates === 0 ? null : excerptDrops / totalCandidates,
      });
    }
    groups[group] = spread(perRep);
  }
  const costs = results.map((r) => r.cost).filter((cost) => cost !== null);
  return {
    model,
    effort,
    reps,
    runs: results.length,
    errors: errors.length,
    usage,
    cost: costs.length === results.length ? costs.reduce((a, b) => a + b, 0) : null,
    cost_per_document: costs.length > 0 && costs.length === results.length ? costs.reduce((a, b) => a + b, 0) / results.length : null,
    ms_per_document: results.length > 0 ? results.reduce((total, r) => total + r.ms, 0) / results.length : null,
    groups,
  };
}

function spread(perRep) {
  const metrics = {};
  for (const key of Object.keys(perRep[0] ?? {})) {
    const values = perRep.map((rep) => rep[key]).filter((value) => value !== null && value !== undefined);
    metrics[key] =
      values.length === 0
        ? null
        : { mean: values.reduce((a, b) => a + b, 0) / values.length, min: Math.min(...values), max: Math.max(...values) };
  }
  return metrics;
}
