// Grades the pipeline's output for one eval case against its expected answer,
// and adds cases up into the metrics product/agents/insight-collector/evals.md
// defines ("What we measure"). Pure: no model calls, so it can be checked by
// feeding it the expected answer itself (--self-check).
import { normalise } from '../pipeline/verify.js';

// A prediction matches an expected insight when their excerpts share a run of
// text at least this share of the shorter one (evals.md, "How predicted
// insights are matched to gold ones").
export const MATCH_THRESHOLD = 0.5;

// Length of the longest common substring over the shorter string's length.
export function overlap(a, b) {
  const x = normalise(a);
  const y = normalise(b);
  if (!x || !y) return 0;
  let best = 0;
  let previous = new Array(y.length + 1).fill(0);
  for (let i = 1; i <= x.length; i++) {
    const current = new Array(y.length + 1).fill(0);
    for (let j = 1; j <= y.length; j++) {
      if (x[i - 1] === y[j - 1]) {
        current[j] = previous[j - 1] + 1;
        if (current[j] > best) best = current[j];
      }
    }
    previous = current;
  }
  return best / Math.min(x.length, y.length);
}

// Pairs predictions with expected insights, best overlap first, each used once.
export function match(predicted, expected) {
  const candidates = [];
  predicted.forEach((p, i) =>
    expected.forEach((e, j) => {
      const score = overlap(p.excerpt, e.excerpt);
      if (score >= MATCH_THRESHOLD) candidates.push({ i, j, score });
    }),
  );
  candidates.sort((a, b) => b.score - a.score);
  const usedP = new Set();
  const usedE = new Set();
  const pairs = [];
  for (const { i, j } of candidates) {
    if (usedP.has(i) || usedE.has(j)) continue;
    usedP.add(i);
    usedE.add(j);
    pairs.push([predicted[i], expected[j]]);
  }
  return {
    pairs,
    unmatchedPredicted: predicted.filter((_, i) => !usedP.has(i)),
    unmatchedExpected: expected.filter((_, j) => !usedE.has(j)),
  };
}

const linkKeys = (links) => new Set((links ?? []).map((entry) => `${entry.kind}:${entry.id}`));

// Link agreement for one insight: tp/fp/fn over `kind:id`, and whether an
// insight that should be unlinked came back unlinked.
export function scoreLinks(predictedLinks, expectedLinks) {
  const predicted = linkKeys(predictedLinks);
  const expected = linkKeys(expectedLinks);
  const tp = [...predicted].filter((key) => expected.has(key)).length;
  return {
    tp,
    fp: predicted.size - tp,
    fn: expected.size - tp,
    noMatch: expected.size === 0 ? { right: predicted.size === 0 ? 1 : 0, total: 1 } : { right: 0, total: 0 },
  };
}

const tally = () => ({ right: 0, total: 0 });
const count = (target, right) => {
  target.total += 1;
  if (right) target.right += 1;
};

// One case, one run: `prediction` is the pipeline's insights for its document.
export function scoreCase(evalCase, prediction) {
  const expected = evalCase.expected.insights ?? [];
  const notInsights = evalCase.expected.not_insights ?? [];
  const { pairs, unmatchedPredicted, unmatchedExpected } = match(prediction, expected);

  const fields = { firsthand: tally(), sentiment: tally(), type: tally() };
  const dollar = { invented: 0, wrong: 0, missed: 0 };
  const links = { tp: 0, fp: 0, fn: 0, noMatch: tally() };
  // Matched insights with every labelled field right, and what the others got
  // wrong: a match only says the excerpt was right.
  const fullyCorrect = tally();
  const mismatches = [];
  for (const [p, e] of pairs) {
    const wrong = [];
    for (const field of Object.keys(fields)) {
      if (e[field] === null || e[field] === undefined) continue;
      const right = p[field] === e[field];
      count(fields[field], right);
      if (!right) wrong.push({ field, expected: e[field], predicted: p[field] ?? null });
    }
    const expectedDollar = e.dollar_impact ?? null;
    const predictedDollar = p.dollar_impact ?? null;
    let dollarError = null;
    if (expectedDollar === null && predictedDollar !== null) dollarError = 'invented';
    else if (expectedDollar !== null && predictedDollar === null) dollarError = 'missed';
    else if (expectedDollar !== null && Number(expectedDollar) !== Number(predictedDollar)) dollarError = 'wrong';
    if (dollarError) {
      dollar[dollarError] += 1;
      wrong.push({ field: 'dollar_impact', expected: expectedDollar, predicted: predictedDollar });
    }
    // A gold insight without a links field wasn't labelled for links.
    if (Array.isArray(e.links)) {
      const scored = scoreLinks(p.links, e.links);
      links.tp += scored.tp;
      links.fp += scored.fp;
      links.fn += scored.fn;
      links.noMatch.right += scored.noMatch.right;
      links.noMatch.total += scored.noMatch.total;
      if (scored.fp + scored.fn > 0) {
        wrong.push({ field: 'links', expected: [...linkKeys(e.links)].sort(), predicted: [...linkKeys(p.links)].sort() });
      }
    }
    count(fullyCorrect, wrong.length === 0);
    mismatches.push(...wrong.map((entry) => ({ name: e.name, excerpt: e.excerpt, ...entry })));
  }
  // A false positive that is one of the case's known non-insights is the
  // mistake a reviewer already turned down once.
  const knownNonInsights = unmatchedPredicted.filter((p) => notInsights.some((n) => overlap(p.excerpt, n.excerpt) >= MATCH_THRESHOLD));
  // A false positive carrying a dollar figure invented one too: nothing in the
  // expected answer states it.
  dollar.invented += unmatchedPredicted.filter((p) => p.dollar_impact !== null && p.dollar_impact !== undefined).length;

  return {
    case: evalCase.name,
    label_source: evalCase.label_source,
    tp: pairs.length,
    fp: unmatchedPredicted.length,
    fn: unmatchedExpected.length,
    emptyDoc: expected.length === 0 ? prediction.length === 0 : null,
    knownNonInsights: knownNonInsights.length,
    fields,
    dollar,
    links,
    fullyCorrect,
    mismatches,
    unmatchedPredicted: unmatchedPredicted.map(({ name, excerpt }) => ({ name, excerpt })),
    missed: unmatchedExpected.map(({ name, excerpt }) => ({ name, excerpt })),
  };
}

const ratio = (num, den) => (den === 0 ? null : num / den);

// Adds up case scores (one run of the set) into the headline metrics. A
// metric with nothing to measure is null, not 0 or 1.
export function aggregate(scores) {
  const sum = (pick) => scores.reduce((total, score) => total + pick(score), 0);
  const tp = sum((s) => s.tp);
  const fp = sum((s) => s.fp);
  const fn = sum((s) => s.fn);
  const empty = scores.filter((s) => s.emptyDoc !== null);
  const field = (name) => ratio(sum((s) => s.fields[name].right), sum((s) => s.fields[name].total));
  const linkTp = sum((s) => s.links.tp);
  return {
    cases: scores.length,
    precision: ratio(tp, tp + fp),
    recall: ratio(tp, tp + fn),
    empty_doc_accuracy: ratio(empty.filter((s) => s.emptyDoc).length, empty.length),
    known_non_insights_suggested: sum((s) => s.knownNonInsights),
    fully_correct_rate: ratio(sum((s) => s.fullyCorrect.right), sum((s) => s.fullyCorrect.total)),
    firsthand_accuracy: field('firsthand'),
    sentiment_accuracy: field('sentiment'),
    type_accuracy: field('type'),
    dollar_invented: sum((s) => s.dollar.invented),
    dollar_wrong: sum((s) => s.dollar.wrong),
    dollar_missed: sum((s) => s.dollar.missed),
    link_precision: ratio(linkTp, linkTp + sum((s) => s.links.fp)),
    link_recall: ratio(linkTp, linkTp + sum((s) => s.links.fn)),
    no_match_accuracy: ratio(sum((s) => s.links.noMatch.right), sum((s) => s.links.noMatch.total)),
  };
}

// Link metrics for the linker run on the gold insights themselves, so they
// don't swing with extraction mistakes (evals.md, "The runner" step 3).
export function aggregateGoldLinks(results) {
  const tp = results.reduce((total, r) => total + r.tp, 0);
  const fp = results.reduce((total, r) => total + r.fp, 0);
  const fn = results.reduce((total, r) => total + r.fn, 0);
  const noMatchRight = results.reduce((total, r) => total + r.noMatch.right, 0);
  const noMatchTotal = results.reduce((total, r) => total + r.noMatch.total, 0);
  return {
    gold_link_precision: ratio(tp, tp + fp),
    gold_link_recall: ratio(tp, tp + fn),
    gold_no_match_accuracy: ratio(noMatchRight, noMatchTotal),
  };
}

// The v1 ship gates (evals.md, "What we measure"): metric → [comparison, bar].
export const GATES = {
  precision: ['>=', 0.8],
  recall: ['>=', 0.6],
  empty_doc_accuracy: ['>=', 0.9],
  firsthand_accuracy: ['>=', 0.9],
  dollar_invented: ['==', 0],
  fabricated_excerpts: ['==', 0],
  link_precision: ['>=', 0.75],
  link_recall: ['>=', 0.6],
  no_match_accuracy: ['>=', 0.8],
};

export function passesGate(metric, value) {
  const gate = GATES[metric];
  if (!gate || value === null || value === undefined) return null;
  return gate[0] === '>=' ? value >= gate[1] : value === gate[1];
}
