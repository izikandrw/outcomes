// summary.md for one eval run: the metric table per set, compared with an
// earlier run, then what to read before drawing conclusions.
import { GATES, passesGate } from './score.js';

const METRICS = [
  ['precision', 'Precision'],
  ['recall', 'Recall'],
  ['empty_doc_accuracy', 'Empty-doc accuracy'],
  ['known_non_insights_suggested', 'Known non-insights suggested'],
  ['fully_correct_rate', 'Fully correct (of matched insights)'],
  ['firsthand_accuracy', 'Firsthand correct'],
  ['sentiment_accuracy', 'Sentiment correct'],
  ['type_accuracy', 'Type correct'],
  ['dollar_invented', 'Dollar impacts invented'],
  ['dollar_wrong', 'Dollar impacts wrong'],
  ['dollar_missed', 'Dollar impacts missed'],
  ['fabricated_excerpts', 'Fabricated excerpts in output'],
  ['verify_drop_rate', 'Verify drop rate'],
  ['failed_runs', 'Runs the model failed'],
  ['link_precision', 'Link precision'],
  ['link_recall', 'Link recall'],
  ['no_match_accuracy', 'No-match accuracy'],
  ['gold_link_precision', 'Link precision (gold insights)'],
  ['gold_link_recall', 'Link recall (gold insights)'],
  ['gold_no_match_accuracy', 'No-match accuracy (gold insights)'],
];

const COUNTS = new Set(['known_non_insights_suggested', 'dollar_invented', 'dollar_wrong', 'dollar_missed', 'fabricated_excerpts', 'failed_runs']);

const GROUP_TITLES = {
  all: 'All cases',
  golden: 'Golden set',
  review: 'Review set',
};

const GROUP_NOTES = {
  review:
    'Expected answers here were drafted from review, so they only know what the collector suggested before: recall on this set is an upper bound, not a measure of what it misses. Use the golden set for recall.',
};

const show = (key, value) => (value === null || value === undefined ? '—' : COUNTS.has(key) ? String(+value.toFixed(2)) : value.toFixed(2));

function row(key, label, metric, previous) {
  if (!metric) return `| ${label} | — | | ${previous ? show(key, previous.mean) : '—'} | | |`;
  const range = metric.min === metric.max ? '' : `${show(key, metric.min)}–${show(key, metric.max)}`;
  let change = '';
  if (previous) {
    const delta = metric.mean - previous.mean;
    // Inside the spread of either run, a change isn't a real change.
    const noise = Math.max(metric.max - metric.min, previous.max - previous.min);
    change = delta === 0 ? '0' : `${delta > 0 ? '+' : ''}${show(key, delta)}${Math.abs(delta) <= noise ? ' (within spread)' : ''}`;
  }
  const gate = passesGate(key, metric.mean);
  const gateText = gate === null ? '' : `${gate ? 'pass' : '**fail**'} (${GATES[key][0]} ${GATES[key][1]})`;
  return `| ${label} | ${show(key, metric.mean)} | ${range} | ${previous ? show(key, previous.mean) : '—'} | ${change} | ${gateText} |`;
}

const fieldValue = (value) => {
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : 'none';
  return value === null || value === undefined ? 'none' : String(value);
};

// One line per way a matched insight's field was wrong, with how many runs
// gave that same wrong answer: a miss on every rep isn't a miss on one.
function mismatchLines(results) {
  const grouped = new Map();
  for (const result of results) {
    for (const m of result.score.mismatches) {
      const insight = m.name || `“${m.excerpt}”`;
      const key = JSON.stringify([result.case, insight, m.field, m.expected, m.predicted]);
      const entry = grouped.get(key) ?? { caseName: result.case, insight, ...m, runs: 0 };
      entry.runs += 1;
      grouped.set(key, entry);
    }
  }
  const runsOf = (name) => results.filter((result) => result.case === name).length;
  return [...grouped.values()].map(
    (m) => `- **${m.caseName}**: ${m.insight} · \`${m.field}\`: expected ${fieldValue(m.expected)}, got ${fieldValue(m.predicted)} (${m.runs} of ${runsOf(m.caseName)} runs)`,
  );
}

const money = (value) => (value === null || value === undefined ? 'unknown' : `$${value.toFixed(value < 1 ? 4 : 2)}`);

// meta: { promptVersion, split, sets, catalog, caseCount, startedAt,
// previousName, showFailures }. `results` and `errors` give the reading list.
export function summaryMarkdown(summary, previous, meta, results, errors) {
  const lines = [
    `# Eval: ${meta.promptVersion} · ${summary.model} · effort ${summary.effort}`,
    '',
    `${meta.startedAt} · split **${meta.split}** · sets ${meta.sets} · ${meta.caseCount} cases × ${summary.reps} reps = ${summary.runs} runs, ${summary.failed_runs} failed by the model, ${summary.errors} errors · catalog: ${meta.catalog}`,
    `Cost ${money(summary.cost)} (${money(summary.cost_per_document)} per document) · ${summary.ms_per_document === null ? '—' : `${(summary.ms_per_document / 1000).toFixed(1)} s`} per document · tokens: ${summary.usage.input} in, ${summary.usage.output} out, ${summary.usage.cache_read} cache read, ${summary.usage.cache_write} cache write`,
    previous ? `Compared with **${meta.previousName}** (${previous.prompt_version} · ${previous.model} · effort ${previous.effort}).` : 'No earlier run to compare with.',
    '',
  ];
  for (const [group, metrics] of Object.entries(summary.groups)) {
    const before = previous?.groups?.[group];
    lines.push(`## ${GROUP_TITLES[group]}`, '');
    if (GROUP_NOTES[group]) lines.push(GROUP_NOTES[group], '');
    lines.push('| metric | mean | spread over reps | previous | change | v1 gate |', '| --- | --- | --- | --- | --- | --- |');
    for (const [key, label] of METRICS) {
      if (!(key in metrics)) continue;
      lines.push(row(key, label, metrics[key], before?.[key]));
    }
    lines.push('');
  }

  lines.push('## Read before drawing conclusions', '');
  if (!meta.showFailures) {
    lines.push(
      'This is the held-out test split, so its failures aren’t listed: tune against dev (evals.md, “Keep a held-out set”). Pass --show-test-failures to list them anyway.',
      '',
    );
  } else {
    const seen = new Set();
    const extra = [];
    const missed = [];
    for (const result of results.filter((r) => !r.failure)) {
      for (const p of result.score.unmatchedPredicted) {
        const key = `${result.case}|${p.name}`;
        if (!seen.has(key)) {
          seen.add(key);
          extra.push(`- **${result.case}**: ${p.name} — “${p.excerpt}”`);
        }
      }
      for (const m of result.score.missed) {
        const key = `${result.case}|missed|${m.name}`;
        if (!seen.has(key)) {
          seen.add(key);
          missed.push(`- **${result.case}**: ${m.name} — “${m.excerpt}”`);
        }
      }
    }
    const mismatches = mismatchLines(results);
    lines.push(
      '### Right insight, wrong fields',
      '',
      'Matched on the excerpt, so these count as found in precision and recall.',
      '',
      ...(mismatches.length ? mismatches.slice(0, 50) : ['None.']),
      '',
      '### Suggested but not expected',
      '',
      'False positives, or insights the labeler missed. When it’s the second, add it to the case’s expected answer.',
      '',
      ...(extra.length ? extra.slice(0, 50) : ['None.']),
      '',
      '### Expected but not found',
      '',
      ...(missed.length ? missed.slice(0, 50) : ['None.']),
      '',
    );
  }
  const failed = results.filter((r) => r.failure);
  if (failed.length > 0) {
    lines.push('## Runs the model failed (scored as finding nothing)', '', ...failed.slice(0, 50).map((r) => `- ${r.case} rep ${r.rep}: ${r.failure.kind}: ${r.failure.message}`), '');
  }
  if (errors.length > 0) {
    lines.push('## Errors (kept out of the scores)', '', ...errors.slice(0, 50).map((e) => `- ${e.case} rep ${e.rep}: ${e.kind}${e.status ? ` ${e.status}` : ''}: ${e.message}`), '');
  }
  lines.push('Every run’s input, output and score is in results.jsonl next to this file.', '');
  return lines.join('\n');
}
