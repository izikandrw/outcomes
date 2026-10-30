import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aggregate, match, overlap, passesGate, scoreCase, scoreLinks } from '../src/evals/score.js';
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
