import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregate, match, overlap, passesGate, scoreCase, scoreLinks } from '../src/evals/score.js';
import { summaryMarkdown } from '../src/evals/report.js';
import { verify } from '../src/pipeline/verify.js';

const DOC = {
  text: 'Priya: Honestly we gave up on SSO after two days. The metadata upload never told us what was wrong.\nRep: I think SSO is confusing for everyone. Renewal is $48,000.',
};

const evalCase = {
  name: 'globex',
  label_source: 'golden',
  document: DOC,
  expected: {
    insights: [
      {
        excerpt: 'we gave up on SSO after two days. The metadata upload never told us what was wrong.',
        name: 'Globex abandoned SSO setup',
        type: 'sales_call',
        sentiment: 'negative',
        firsthand: true,
        dollar_impact: null,
        links: [{ kind: 'outcome', id: '12' }],
      },
    ],
    not_insights: [{ excerpt: 'I think SSO is confusing for everyone', name: 'rep opinion' }],
  },
};

test('overlap is the longest shared run of text over the shorter excerpt, ignoring case and spacing', () => {
  assert.equal(overlap('We gave up on SSO', 'honestly we  gave up on sso after two days'), 1);
  assert.ok(overlap('we gave up on SSO after two days', 'the metadata upload never told us') < 0.5);
  assert.equal(overlap('', 'x'), 0);
});

test('match pairs each prediction with at most one expected insight, best overlap first', () => {
  const { pairs, unmatchedPredicted, unmatchedExpected } = match(
    [{ excerpt: 'we gave up on SSO after two days' }, { excerpt: 'gave up on SSO' }, { excerpt: 'Renewal is $48,000' }],
    [{ excerpt: 'we gave up on SSO after two days.' }],
  );
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0][0].excerpt, 'we gave up on SSO after two days');
  assert.equal(unmatchedPredicted.length, 2);
  assert.equal(unmatchedExpected.length, 0);
});

test('a case scores matches, misses, known non-insights, fields, invented dollars and links', () => {
  const score = scoreCase(evalCase, [
    {
      excerpt: 'we gave up on SSO after two days',
      name: 'x',
      type: 'interview',
      sentiment: 'negative',
      firsthand: true,
      dollar_impact: 48000,
      links: [{ kind: 'outcome', id: '12' }, { kind: 'project', id: '3' }],
    },
    { excerpt: 'I think SSO is confusing for everyone', name: 'SSO is confusing', dollar_impact: null, links: [] },
  ]);
  assert.deepEqual([score.tp, score.fp, score.fn], [1, 1, 0]);
  assert.equal(score.knownNonInsights, 1);
  assert.deepEqual(score.fields.type, { right: 0, total: 1 });
  assert.deepEqual(score.fields.sentiment, { right: 1, total: 1 });
  assert.equal(score.dollar.invented, 1);
  assert.deepEqual([score.links.tp, score.links.fp, score.links.fn], [1, 1, 0]);
  assert.equal(score.emptyDoc, null);
});

const goldInsight = evalCase.expected.insights[0];
const withDollar = (dollar_impact) => ({
  ...evalCase,
  expected: { insights: [{ ...goldInsight, dollar_impact }] },
});

test('a matched insight is fully correct only when every labelled field is right, and precision ignores it', () => {
  const right = scoreCase(evalCase, [goldInsight]);
  assert.deepEqual(right.fullyCorrect, { right: 1, total: 1 });
  assert.deepEqual(right.mismatches, []);

  const wrong = scoreCase(evalCase, [{ ...goldInsight, type: 'interview', firsthand: false }]);
  assert.deepEqual(wrong.fullyCorrect, { right: 0, total: 1 });
  assert.deepEqual(wrong.mismatches.map((m) => [m.name, m.field, m.expected, m.predicted]), [
    ['Globex abandoned SSO setup', 'firsthand', true, false],
    ['Globex abandoned SSO setup', 'type', 'sales_call', 'interview'],
  ]);
  assert.deepEqual([wrong.tp, wrong.fp, wrong.fn], [1, 0, 0]);
  assert.equal(aggregate([right, wrong]).fully_correct_rate, 0.5);
  assert.equal(aggregate([right, wrong]).precision, 1);
});

test('a field labelled null is not held against the insight', () => {
  const unlabelled = { ...evalCase, expected: { insights: [{ ...goldInsight, sentiment: null, firsthand: null }] } };
  const score = scoreCase(unlabelled, [{ ...goldInsight, sentiment: 'positive', firsthand: false }]);
  assert.deepEqual(score.fullyCorrect, { right: 1, total: 1 });
  assert.deepEqual(score.mismatches, []);
});

test('a link that differs from the label is a mismatch, listed as sorted ids', () => {
  const score = scoreCase(evalCase, [{ ...goldInsight, links: [{ kind: 'project', id: '3' }, { kind: 'outcome', id: '12' }] }]);
  assert.deepEqual(score.fullyCorrect, { right: 0, total: 1 });
  assert.deepEqual(score.mismatches.map((m) => [m.field, m.expected, m.predicted]), [
    ['links', ['outcome:12'], ['outcome:12', 'project:3']],
  ]);
});

test('dollar figures count as invented, wrong or missed, and each is a mismatch', () => {
  const grade = (expected, predicted) => {
    const { dollar, fullyCorrect, mismatches } = scoreCase(withDollar(expected), [{ ...goldInsight, dollar_impact: predicted }]);
    return { dollar, right: fullyCorrect.right, fields: mismatches.map((m) => [m.expected, m.predicted]) };
  };
  assert.deepEqual(grade(48000, null), { dollar: { invented: 0, wrong: 0, missed: 1 }, right: 0, fields: [[48000, null]] });
  assert.deepEqual(grade(null, 48000), { dollar: { invented: 1, wrong: 0, missed: 0 }, right: 0, fields: [[null, 48000]] });
  assert.deepEqual(grade(48000, 90000), { dollar: { invented: 0, wrong: 1, missed: 0 }, right: 0, fields: [[48000, 90000]] });
  assert.deepEqual(grade(48000, 48000), { dollar: { invented: 0, wrong: 0, missed: 0 }, right: 1, fields: [] });
  assert.deepEqual(grade('48000', 48000), { dollar: { invented: 0, wrong: 0, missed: 0 }, right: 1, fields: [] });
  assert.deepEqual(grade(null, null), { dollar: { invented: 0, wrong: 0, missed: 0 }, right: 1, fields: [] });
  // Zero is a figure, not the absence of one.
  assert.deepEqual(grade(null, 0), { dollar: { invented: 1, wrong: 0, missed: 0 }, right: 0, fields: [[null, 0]] });
  assert.deepEqual(grade(0, null), { dollar: { invented: 0, wrong: 0, missed: 1 }, right: 0, fields: [[0, null]] });
  assert.equal(aggregate([scoreCase(withDollar(48000), [{ ...goldInsight, dollar_impact: null }])]).dollar_missed, 1);
});

const reportMeta = { promptVersion: 'v1', split: 'dev', sets: 'all', catalog: 'frozen', caseCount: 1, startedAt: 'now', previousName: null };
const reportSummary = {
  model: 'm',
  effort: 'high',
  reps: 2,
  runs: 2,
  errors: 0,
  usage: { input: 0, output: 0, cache_read: 0, cache_write: 0 },
  cost: null,
  cost_per_document: null,
  ms_per_document: null,
  groups: {},
};
const repResults = () => [
  { case: 'globex', score: scoreCase(evalCase, [{ ...goldInsight, type: 'interview' }]) },
  { case: 'globex', score: scoreCase(evalCase, [{ ...goldInsight, type: 'interview', firsthand: false }]) },
];

test('the summary lists wrong fields, grouped across reps', () => {
  const markdown = summaryMarkdown(reportSummary, null, { ...reportMeta, showFailures: true }, repResults(), []);
  assert.ok(markdown.includes('### Right insight, wrong fields'));
  assert.ok(markdown.includes('Globex abandoned SSO setup · `type`: expected sales_call, got interview (2 of 2 runs)'));
  assert.ok(markdown.includes('Globex abandoned SSO setup · `firsthand`: expected true, got false (1 of 2 runs)'));
});

test('the held-out split keeps wrong fields out of the summary', () => {
  const markdown = summaryMarkdown(reportSummary, null, { ...reportMeta, showFailures: false }, repResults(), []);
  assert.ok(!markdown.includes('wrong fields'));
  assert.ok(!markdown.includes('Globex abandoned'));
});

test('an empty document is right only when nothing is predicted', () => {
  const empty = { ...evalCase, expected: { insights: [] } };
  assert.equal(scoreCase(empty, []).emptyDoc, true);
  assert.equal(scoreCase(empty, [{ excerpt: 'Renewal is $48,000', name: 'x' }]).emptyDoc, false);
});

test('scoreLinks counts an insight that should be unlinked', () => {
  assert.deepEqual(scoreLinks([], []).noMatch, { right: 1, total: 1 });
  assert.deepEqual(scoreLinks([{ kind: 'outcome', id: '1' }], []).noMatch, { right: 0, total: 1 });
});

test('aggregate leaves a metric with nothing to measure null', () => {
  const metrics = aggregate([scoreCase({ ...evalCase, expected: { insights: [] } }, [])]);
  assert.equal(metrics.precision, null);
  assert.equal(metrics.recall, null);
  assert.equal(metrics.empty_doc_accuracy, 1);
});

test('gates compare against the v1 bars', () => {
  assert.equal(passesGate('precision', 0.81), true);
  assert.equal(passesGate('precision', 0.79), false);
  assert.equal(passesGate('dollar_invented', 0), true);
  assert.equal(passesGate('type_accuracy', 0.1), null);
});

test('verify clears a dollar figure with no basis, or one its basis does not state', () => {
  const document = { text: 'We gave up on SSO. It puts $40k ARR at risk, about $1.2M over three years, or forty thousand dollars. Budget: $90,000.' };
  const check = (dollar_impact, dollar_impact_basis) => {
    const { kept, drops } = verify(document, [{ excerpt: 'we gave up on SSO', dollar_impact, dollar_impact_basis }]);
    return { figure: kept[0].dollar_impact, reasons: drops.map((d) => d.reason) };
  };
  const stated = (figure) => ({ figure, reasons: [] });
  const cleared = (reason) => ({ figure: null, reasons: [reason] });

  assert.deepEqual(check(40000, '$40k ARR at risk'), stated(40000));
  assert.deepEqual(check(1200000, 'about $1.2M'), stated(1200000));
  assert.deepEqual(check(90000, 'Budget: $90,000'), stated(90000));

  assert.deepEqual(check(99000, null), cleared('dollar_basis_not_in_document'));
  assert.deepEqual(check(99000, '   '), cleared('dollar_basis_not_in_document'));
  assert.deepEqual(check(99000, '$99k'), cleared('dollar_basis_not_in_document'));
  assert.deepEqual(check(400000, '$40k ARR at risk'), cleared('dollar_figure_not_in_basis'));
  assert.deepEqual(check(40, '$40k ARR at risk'), cleared('dollar_figure_not_in_basis'));
  assert.deepEqual(check(40000, 'forty thousand dollars'), cleared('dollar_figure_not_in_basis'));
  assert.deepEqual(check(3, 'three years'), cleared('dollar_figure_not_in_basis'));
});

test('verify drops made-up and repeated excerpts and clears an unsupported dollar figure', () => {
  const { kept, drops } = verify(DOC, [
    { excerpt: 'we gave up on SSO', dollar_impact: null },
    { excerpt: 'We  gave up on “SSO”'.replace(/[“”]/g, ''), dollar_impact: null },
    { excerpt: 'we loved SSO', dollar_impact: null },
    { excerpt: 'The metadata upload never told us', dollar_impact: 90000, dollar_impact_basis: '$90,000 at risk' },
  ]);
  assert.deepEqual(drops.map((d) => d.reason), ['duplicate_excerpt', 'excerpt_not_in_document', 'dollar_basis_not_in_document']);
  assert.equal(kept.length, 2);
  assert.equal(kept[1].dollar_impact, null);
});
