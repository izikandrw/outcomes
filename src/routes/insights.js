const express = require('express');
const pool = require('../db');
const { belongsToAccount, missingFromAccount } = require('../lib/validateRef');
const { adoptProposals } = require('../lib/adoptProposals');

const router = express.Router({ mergeParams: true });

const TYPES = [
  'support_ticket', 'session_recording', 'interview', 'funnel', 'experiment',
  'sales_call', 'feature_request', 'survey', 'review', 'other',
];
const IMPACT_AREAS = ['acquisition', 'activation', 'retention', 'expansion', 'cost', 'other'];
const SENTIMENTS = ['positive', 'neutral', 'negative'];
const STATUSES = ['unvalidated', 'validated', 'rejected'];
const REJECTION_REASONS = ['not_an_insight', 'inaccurate', 'wrong_link', 'duplicate', 'other'];
const MAX_PROPOSED_LINKS = 3;

// The insight collector agent signs in with this role. It may only suggest
// insights; a person validates them (see product/agents/insight-collector/).
const isCollector = (req) => req.user.role === 'collector';

// Every read shape carries the linked outcome and project ids so a client can
// render an insight's evidence trail without extra round trips, plus the
// collector's reason for each link that has one, keyed by id:
// link_rationales = { outcomes: { "12": "..." }, projects: { "4": "..." } }.
const SELECT_INSIGHT = `
  SELECT i.*,
         COALESCE(
           (SELECT array_agg(io.outcome_id ORDER BY io.outcome_id) FROM insight_outcomes io WHERE io.insight_id = i.id),
           '{}'
         ) AS outcome_ids,
         COALESCE(
           (SELECT array_agg(ip.project_id ORDER BY ip.project_id) FROM insight_projects ip WHERE ip.insight_id = i.id),
           '{}'
         ) AS project_ids,
         json_build_object(
           'outcomes', COALESCE(
             (SELECT json_object_agg(io.outcome_id, io.rationale) FROM insight_outcomes io
               WHERE io.insight_id = i.id AND io.rationale IS NOT NULL),
             '{}'
           ),
           'projects', COALESCE(
             (SELECT json_object_agg(ip.project_id, ip.rationale) FROM insight_projects ip
               WHERE ip.insight_id = i.id AND ip.rationale IS NOT NULL),
             '{}'
           )
         ) AS link_rationales
    FROM insights i
`;

async function fetchInsight(executor, insightId, accountId) {
  const { rows } = await executor.query(`${SELECT_INSIGHT} WHERE i.id = $1 AND i.account_id = $2`, [
    insightId,
    accountId,
  ]);
  return rows[0] ?? null;
}

// observed_at as Postgres should store it: null when empty, a bare date as
// midnight UTC (like the web form sends; Postgres would otherwise read it in
// the server's timezone), a full ISO 8601 timestamp as given. Anything else,
// including a month alone or a day the month doesn't have, is undefined.
function parseObservedAt(value) {
  if (value === undefined || value === null || value === '') return null;
  const match = typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/.exec(value);
  if (!match) return undefined;
  const [, year, month, day, time] = match;
  // Date rolls 2026-02-30 over to 2026-03-02; Postgres rejects it.
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== Number(day)) return undefined;
  if (time && Number.isNaN(Date.parse(value))) return undefined;
  return time ? value : `${value}T00:00:00Z`;
}

// Validates the body. Writes the response and returns null when something
// doesn't check out; otherwise returns the normalised values.
async function readBody(req, res) {
  const {
    name, type, description, source, observed_at, dollar_impact, impact_area, sentiment,
    outcome_ids, project_ids, link_rationales, proposed_links,
  } = req.body;

  if (!name) {
    res.status(400).json({ error: 'name is required' });
    return null;
  }
  if (type !== undefined && !TYPES.includes(type)) {
    res.status(400).json({ error: `type must be one of: ${TYPES.join(', ')}` });
    return null;
  }
  if (impact_area !== undefined && impact_area !== null && impact_area !== '' && !IMPACT_AREAS.includes(impact_area)) {
    res.status(400).json({ error: `impact_area must be one of: ${IMPACT_AREAS.join(', ')}` });
    return null;
  }
  if (sentiment !== undefined && sentiment !== null && sentiment !== '' && !SENTIMENTS.includes(sentiment)) {
    res.status(400).json({ error: `sentiment must be one of: ${SENTIMENTS.join(', ')}` });
    return null;
  }
  const observedAt = parseObservedAt(observed_at);
  if (observedAt === undefined) {
    res.status(400).json({ error: 'observed_at must be a date (YYYY-MM-DD) or an ISO 8601 timestamp' });
    return null;
  }
  if (dollar_impact !== undefined && dollar_impact !== null && dollar_impact !== '') {
    if (!Number.isFinite(Number(dollar_impact)) || Math.abs(Number(dollar_impact)) >= 1e12) {
      res.status(400).json({ error: 'dollar_impact must be a number' });
      return null;
    }
  }

  const links = {};
  for (const [field, table, ids] of [
    ['outcome_ids', 'outcomes', outcome_ids],
    ['project_ids', 'projects', project_ids],
  ]) {
    if (ids === undefined) continue;
    if (!Array.isArray(ids)) {
      res.status(400).json({ error: `${field} must be an array` });
      return null;
    }
    const unique = [...new Set(ids.map(String))];
    const missing = await missingFromAccount(table, unique, req.accountId);
    if (missing.length > 0) {
      res.status(400).json({ error: `${field} not found in this account: ${missing.join(', ')}` });
      return null;
    }
    links[field] = unique;
  }

  // Only rationales for links the request makes are kept; see replaceLinks.
  const rationales = { outcomes: {}, projects: {} };
  if (link_rationales !== undefined && link_rationales !== null) {
    for (const kind of ['outcomes', 'projects']) {
      const given = link_rationales[kind] ?? {};
      if (typeof given !== 'object' || Array.isArray(given) || Object.values(given).some((text) => typeof text !== 'string')) {
        res.status(400).json({ error: `link_rationales.${kind} must map ids to text` });
        return null;
      }
      rationales[kind] = given;
    }
  }

  const proposedLinks = readProposedLinks(proposed_links, res);
  if (proposedLinks === null) return null;

  return {
    name,
    type: type || 'other',
    description: description || null,
    source: source || null,
    observedAt,
    dollarImpact: dollar_impact === undefined || dollar_impact === null || dollar_impact === '' ? null : Number(dollar_impact),
    impactArea: impact_area || null,
    sentiment: sentiment || null,
    outcomeIds: links.outcome_ids,
    projectIds: links.project_ids,
    rationales,
    proposedLinks,
  };
}

// Outcomes or projects the collector thinks are missing, each with why this
// insight is evidence for it. A reviewer creates one (and links the insight to
// it) or dismisses it. undefined when the request didn't mention the field.
function readProposedLinks(proposed, res) {
  if (proposed === undefined) return undefined;
  if (!Array.isArray(proposed) || proposed.length > MAX_PROPOSED_LINKS) {
    res.status(400).json({ error: `proposed_links must be an array of at most ${MAX_PROPOSED_LINKS}` });
    return null;
  }
  const normalised = [];
  for (const entry of proposed) {
    const { kind, name, description, rationale } = entry ?? {};
    if (!['outcome', 'project'].includes(kind) || typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'each proposed link needs kind (outcome or project) and a name' });
      return null;
    }
    if ([description, rationale].some((value) => value != null && typeof value !== 'string')) {
      res.status(400).json({ error: 'proposed link description and rationale must be text' });
      return null;
    }
    normalised.push({ kind, name: name.trim(), description: description?.trim() || null, rationale: rationale?.trim() || null });
  }
  return normalised;
}

// Where an insight came from. Set when it is created; an edit changes only the
// parts it names (see readProvenanceEdits), so a full edit never wipes it.
async function readProvenance(req, res) {
  const { status, source_system, source_url, source_external_id, source_excerpt, firsthand, collection_run_id } = req.body;

  // A person's own insight is evidence straight away unless they say otherwise;
  // the collector's never is.
  let initialStatus = status || 'validated';
  if (!['unvalidated', 'validated'].includes(initialStatus)) {
    res.status(400).json({ error: 'status must be unvalidated or validated' });
    return null;
  }
  if (isCollector(req)) initialStatus = 'unvalidated';

  if (firsthand !== undefined && firsthand !== null && typeof firsthand !== 'boolean') {
    res.status(400).json({ error: 'firsthand must be true or false' });
    return null;
  }
  if (collection_run_id && !(await belongsToAccount('collection_runs', collection_run_id, req.accountId))) {
    res.status(400).json({ error: 'collection_run_id not found in this account' });
    return null;
  }

  return {
    status: initialStatus,
    sourceSystem: source_system || null,
    sourceUrl: source_url || null,
    sourceExternalId: source_external_id || null,
    sourceExcerpt: source_excerpt || null,
    firsthand: firsthand ?? null,
    collectionRunId: collection_run_id || null,
  };
}

// The provenance fields a PUT names, by column. A reviewer can correct the
// collector's source, source link or firsthand call in place; fields the
// request leaves out are kept.
const PROVENANCE_COLUMNS = ['source_system', 'source_url', 'source_external_id', 'source_excerpt', 'firsthand'];

function readProvenanceEdits(req, res) {
  const edits = {};
  for (const column of PROVENANCE_COLUMNS) {
    if (!(column in req.body)) continue;
    const value = req.body[column];
    if (column === 'firsthand') {
      if (value !== null && typeof value !== 'boolean') {
        res.status(400).json({ error: 'firsthand must be true or false' });
        return null;
      }
      edits[column] = value;
    } else {
      if (value !== null && typeof value !== 'string') {
        res.status(400).json({ error: `${column} must be text` });
        return null;
      }
      edits[column] = value?.trim() || null;
    }
  }
  return edits;
}

// Replaces an insight's links in `table` with `ids`. Left alone when the
// request didn't mention the field at all. A link that survives keeps its
// rationale unless the request gives a new one, so editing an insight in the
// UI doesn't erase why the collector linked it.
async function replaceLinks(client, table, column, insightId, accountId, ids, rationales) {
  if (ids === undefined) return;
  const { rows: previous } = await client.query(
    `SELECT ${column} AS id, rationale FROM ${table} WHERE insight_id = $1 AND account_id = $2`,
    [insightId, accountId]
  );
  const kept = new Map(previous.map((row) => [String(row.id), row.rationale]));
  await client.query(`DELETE FROM ${table} WHERE insight_id = $1 AND account_id = $2`, [insightId, accountId]);
  if (ids.length === 0) return;
  await client.query(
    `INSERT INTO ${table} (account_id, insight_id, ${column}, rationale)
     SELECT $1, $2, unnest($3::bigint[]), unnest($4::text[])`,
    [accountId, insightId, ids, ids.map((id) => rationales[id] ?? kept.get(String(id)) ?? null)]
  );
}

async function replaceAllLinks(client, insightId, accountId, input) {
  await replaceLinks(client, 'insight_outcomes', 'outcome_id', insightId, accountId, input.outcomeIds, input.rationales.outcomes);
  await replaceLinks(client, 'insight_projects', 'project_id', insightId, accountId, input.projectIds, input.rationales.projects);
}

// The collector may read and suggest, nothing else.
function forbidCollector(req, res, next) {
  if (isCollector(req)) return res.status(403).json({ error: 'the insight collector may only create unvalidated insights' });
  next();
}

// ?status=unvalidated narrows to one status, e.g. the review queue.
router.get('/', async (req, res, next) => {
  try {
    const { status } = req.query;
    if (status !== undefined && !STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${STATUSES.join(', ')}` });
    }
    const { rows } = await pool.query(
      `${SELECT_INSIGHT} WHERE i.account_id = $1 AND ($2::text IS NULL OR i.status = $2) ORDER BY i.id`,
      [req.accountId, status ?? null]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get('/:insightId', async (req, res, next) => {
  try {
    const insight = await fetchInsight(pool, req.params.insightId, req.accountId);
    if (!insight) return res.status(404).json({ error: 'insight not found' });
    res.json(insight);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  let client;
  try {
    const input = await readBody(req, res);
    if (!input) return;
    const provenance = await readProvenance(req, res);
    if (!provenance) return;

    client = await pool.connect();
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO insights (account_id, name, type, description, source, observed_at, dollar_impact, impact_area,
         status, source_system, source_url, source_external_id, source_excerpt, firsthand, collection_run_id, proposed_links,
         sentiment)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING id`,
      [
        req.accountId,
        input.name,
        input.type,
        input.description,
        input.source,
        input.observedAt,
        input.dollarImpact,
        input.impactArea,
        provenance.status,
        provenance.sourceSystem,
        provenance.sourceUrl,
        provenance.sourceExternalId,
        provenance.sourceExcerpt,
        provenance.firsthand,
        provenance.collectionRunId,
        JSON.stringify(input.proposedLinks ?? []),
        input.sentiment,
      ]
    );
    await replaceAllLinks(client, rows[0].id, req.accountId, {
      outcomeIds: input.outcomeIds ?? [],
      projectIds: input.projectIds ?? [],
      rationales: input.rationales,
    });
    // A proposal for an outcome or project that already exists becomes a link to it.
    await adoptProposals(client, req.accountId);
    await client.query('COMMIT');

    res.status(201).json(await fetchInsight(pool, rows[0].id, req.accountId));
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    if (client) client.release();
  }
});

router.put('/:insightId', forbidCollector, async (req, res, next) => {
  let client;
  try {
    const input = await readBody(req, res);
    if (!input) return;
    const provenance = readProvenanceEdits(req, res);
    if (!provenance) return;

    client = await pool.connect();
    await client.query('BEGIN');
    const { rows } = await client.query(
      // Changing a suggestion before approving it is recorded: how often
      // reviewers have to fix the collector's output is a quality signal.
      `UPDATE insights SET name = $1, type = $2, description = $3, source = $4, observed_at = $5,
         dollar_impact = $6, impact_area = $7, updated_at = now(),
         proposed_links = COALESCE($10::jsonb, proposed_links), sentiment = $11,
         edited_in_review = edited_in_review OR status = 'unvalidated'
       WHERE id = $8 AND account_id = $9 RETURNING id`,
      [
        input.name,
        input.type,
        input.description,
        input.source,
        input.observedAt,
        input.dollarImpact,
        input.impactArea,
        req.params.insightId,
        req.accountId,
        input.proposedLinks === undefined ? null : JSON.stringify(input.proposedLinks),
        input.sentiment,
      ]
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'insight not found' });
    }
    const columns = Object.keys(provenance);
    if (columns.length > 0) {
      await client.query(
        `UPDATE insights SET ${columns.map((column, i) => `${column} = $${i + 3}`).join(', ')}
         WHERE id = $1 AND account_id = $2`,
        [rows[0].id, req.accountId, ...Object.values(provenance)]
      );
    }
    await replaceAllLinks(client, rows[0].id, req.accountId, input);
    await client.query('COMMIT');

    res.json(await fetchInsight(pool, req.params.insightId, req.accountId));
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    if (client) client.release();
  }
});

// Approves a suggestion: it becomes evidence. Also undoes a rejection.
router.post('/:insightId/validate', forbidCollector, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      `UPDATE insights SET status = 'validated', reviewed_by = $1, reviewed_at = now(),
         rejection_reason = NULL, review_note = NULL, updated_at = now()
       WHERE id = $2 AND account_id = $3`,
      [req.user.id, req.params.insightId, req.accountId]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'insight not found' });
    res.json(await fetchInsight(pool, req.params.insightId, req.accountId));
  } catch (err) {
    next(err);
  }
});

// Turns a suggestion down. The row is kept so the collector never suggests it
// again, and the reason feeds its evals.
router.post('/:insightId/reject', forbidCollector, async (req, res, next) => {
  const { reason, note } = req.body;
  if (!REJECTION_REASONS.includes(reason)) {
    return res.status(400).json({ error: `reason must be one of: ${REJECTION_REASONS.join(', ')}` });
  }
  try {
    const { rowCount } = await pool.query(
      `UPDATE insights SET status = 'rejected', rejection_reason = $1, review_note = $2,
         reviewed_by = $3, reviewed_at = now(), updated_at = now()
       WHERE id = $4 AND account_id = $5`,
      [reason, note || null, req.user.id, req.params.insightId, req.accountId]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'insight not found' });
    res.json(await fetchInsight(pool, req.params.insightId, req.accountId));
  } catch (err) {
    next(err);
  }
});

// Undoes a review, approval or rejection: the insight goes back to the review
// queue and stops counting as evidence.
router.post('/:insightId/reopen', forbidCollector, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      `UPDATE insights SET status = 'unvalidated', reviewed_by = NULL, reviewed_at = NULL,
         rejection_reason = NULL, review_note = NULL, updated_at = now()
       WHERE id = $1 AND account_id = $2`,
      [req.params.insightId, req.accountId]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'insight not found' });
    res.json(await fetchInsight(pool, req.params.insightId, req.accountId));
  } catch (err) {
    next(err);
  }
});

router.delete('/:insightId', forbidCollector, async (req, res, next) => {
  try {
    // insight_outcomes and insight_projects rows cascade.
    const { rowCount } = await pool.query('DELETE FROM insights WHERE id = $1 AND account_id = $2', [
      req.params.insightId,
      req.accountId,
    ]);
    if (rowCount === 0) return res.status(404).json({ error: 'insight not found' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
