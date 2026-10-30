// Eval cases for the insight collector (product/agents/insight-collector/evals.md):
// a document, and the answer the collector should give for it, in the shape of
// agent-insight-collector/evals/cases/<name>/document.json and expected.json.

// The document as the collector's pipeline reads it (design.md §2.1), from a
// document a run recorded. Runs don't record the date, customer or firsthand
// call, so those are left for a person to fill in.
function documentFromRun(run, doc, insights) {
  return {
    source_system: run.source_system,
    external_id: doc.external_id,
    url: insights.find((insight) => insight.source_url)?.source_url ?? null,
    title: doc.title,
    occurred_at: null,
    customer: null,
    firsthand: null,
    metadata: { collection_run_id: Number(run.id), run_document_id: Number(doc.id) },
    text: doc.text,
  };
}

const emptyExpected = () => ({ insights: [], not_insights: [], notes: '', tags: [] });

// Rejection reasons that say the collector shouldn't have suggested this at all,
// so the case can name it as something not to extract. The rest (a duplicate,
// a wrong link, other) leave open whether it was a real insight, so a person
// decides.
const NOT_AN_INSIGHT = ['not_an_insight', 'inaccurate'];

// An expected answer drafted from review: what reviewers approved, as they left
// it, is what the collector should find; what they turned down as not an
// insight, it shouldn't. `names` maps 'outcome:<id>' and 'project:<id>' to
// names, so a case stays readable after the catalog changes. Ready only when
// every suggestion was reviewed and none needs a judgment call.
function draftFromReview(doc, insights, names) {
  const expected = emptyExpected();
  const open = [];
  for (const insight of insights) {
    if (insight.status === 'validated') {
      expected.insights.push({
        excerpt: insight.source_excerpt,
        name: insight.name,
        type: insight.type,
        sentiment: insight.sentiment ?? null,
        firsthand: insight.firsthand ?? null,
        dollar_impact: insight.dollar_impact == null ? null : Number(insight.dollar_impact),
        links: [
          ...(insight.outcome_ids ?? []).map((id) => ({ kind: 'outcome', id: String(id), name: names[`outcome:${id}`] ?? null })),
          ...(insight.project_ids ?? []).map((id) => ({ kind: 'project', id: String(id), name: names[`project:${id}`] ?? null })),
        ],
        proposed: (insight.proposed_links ?? []).map(({ kind, name }) => ({ kind, name })),
      });
    } else if (insight.status === 'rejected' && NOT_AN_INSIGHT.includes(insight.rejection_reason)) {
      expected.not_insights.push({
        excerpt: insight.source_excerpt,
        name: insight.name,
        reason: insight.rejection_reason,
        ...(insight.review_note ? { note: insight.review_note } : {}),
      });
    } else {
      const why = insight.status === 'rejected' ? `rejected as ${insight.rejection_reason}` : 'not reviewed yet';
      open.push(`“${insight.name}” (#${insight.id}) is ${why}: decide whether it belongs in insights.`);
    }
  }
  if (doc.decision === 'no_insight') {
    expected.notes = `The collector found no insight here${doc.reason ? `: ${doc.reason}` : ''}. Check that nothing was missed.`;
  }
  if (open.length > 0) expected.notes = [expected.notes, ...open].filter(Boolean).join('\n');
  expected.tags = [doc.decision === 'no_insight' ? 'no-insight' : 'from-review'];
  // A skipped document is only a claim that nothing was there, so a person
  // checks it before it counts.
  const ready = open.length === 0 && doc.decision !== 'no_insight';
  return { expected, ready };
}

// Matches the collector's excerpt check: whitespace, curly quotes and case
// don't count.
const normalise = (text) =>
  String(text ?? '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

// What stops `expected` being scored against `document`, as messages; empty
// when it can be. Shape problems block saving; `unready` ones (an excerpt not
// in the document, a link to something not in the case's frozen catalog) only
// block marking the case ready, so a draft can be saved half-done.
function checkCase(document, expected, catalog) {
  const shape = [];
  if (!document || typeof document !== 'object' || typeof document.text !== 'string' || !document.text.trim()) {
    shape.push('document needs its text');
  }
  if (!expected || typeof expected !== 'object' || Array.isArray(expected)) {
    return { shape: [...shape, 'expected must be an object'], unready: [] };
  }
  for (const field of ['insights', 'not_insights']) {
    if (expected[field] !== undefined && !Array.isArray(expected[field])) shape.push(`expected.${field} must be a list`);
  }
  if (shape.length > 0) return { shape, unready: [] };

  const text = normalise(document.text);
  const unready = [];
  for (const field of ['insights', 'not_insights']) {
    (expected[field] ?? []).forEach((entry, i) => {
      if (!entry?.excerpt) unready.push(`expected.${field}[${i}] needs an excerpt`);
      else if (!text.includes(normalise(entry.excerpt))) unready.push(`expected.${field}[${i}]'s excerpt isn't in the document`);
    });
  }
  if (catalog) {
    const known = catalogKeys(catalog);
    (expected.insights ?? []).forEach((entry, i) => {
      for (const link of Array.isArray(entry?.links) ? entry.links : []) {
        if (!known.has(`${link.kind}:${link.id}`)) {
          unready.push(`expected.insights[${i}] links to ${link.kind} ${link.id}${link.name ? ` (${link.name})` : ''}, which isn't in this case's catalog`);
        }
      }
    });
  }
  return { shape, unready };
}

const catalogKeys = (catalog) =>
  new Set([
    ...(catalog.outcomes ?? []).map((entry) => `outcome:${entry.id}`),
    ...(catalog.projects ?? []).map((entry) => `project:${entry.id}`),
  ]);

// The account's outcomes and projects as a case freezes them: ids as text, in
// id order, with what the link step reads (name and description).
async function snapshotCatalog(executor, accountId) {
  const pick = (rows) => rows.map((row) => ({ id: String(row.id), name: row.name, description: row.description ?? null }));
  const [{ rows: outcomes }, { rows: projects }] = await Promise.all([
    executor.query('SELECT id, name, description FROM outcomes WHERE account_id = $1 ORDER BY id', [accountId]),
    executor.query('SELECT id, name, description FROM projects WHERE account_id = $1 ORDER BY id', [accountId]),
  ]);
  return { outcomes: pick(outcomes), projects: pick(projects) };
}

module.exports = { documentFromRun, emptyExpected, draftFromReview, checkCase, snapshotCatalog };
