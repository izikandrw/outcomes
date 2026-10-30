// The collector proposes outcomes and projects that don't exist yet, and each
// insight keeps its own copy of the proposal (insights.proposed_links). Once
// one with that name exists, however it came to, every insight still awaiting
// review that proposed it should link to the real one instead: this turns
// those proposals into links, carrying the rationale over, and drops them.
// Names match ignoring case and surrounding space; the oldest match wins.
// Each adoption is recorded on the insight's history, as done by `actorId`
// (whoever's change made the match).
const { recordEvent } = require('./insightEvents');

const TABLES = {
  outcome: { entities: 'outcomes', links: 'insight_outcomes', column: 'outcome_id' },
  project: { entities: 'projects', links: 'insight_projects', column: 'project_id' },
};

const key = (name) => String(name ?? '').trim().toLowerCase();

async function adoptProposals(client, accountId, actorId = null) {
  const { rows: insights } = await client.query(
    `SELECT id, proposed_links FROM insights
      WHERE account_id = $1 AND status = 'unvalidated' AND jsonb_array_length(proposed_links) > 0
      FOR UPDATE`,
    [accountId]
  );
  if (insights.length === 0) return;

  const byName = {};
  for (const [kind, { entities }] of Object.entries(TABLES)) {
    const { rows } = await client.query(`SELECT id, name FROM ${entities} WHERE account_id = $1 ORDER BY id`, [
      accountId,
    ]);
    byName[kind] = new Map();
    for (const row of rows) if (!byName[kind].has(key(row.name))) byName[kind].set(key(row.name), row.id);
  }

  for (const insight of insights) {
    const kept = [];
    for (const proposal of insight.proposed_links) {
      const id = byName[proposal.kind]?.get(key(proposal.name));
      if (id === undefined) {
        kept.push(proposal);
        continue;
      }
      const { links, column } = TABLES[proposal.kind];
      await client.query(
        `INSERT INTO ${links} (account_id, insight_id, ${column}, rationale) VALUES ($1, $2, $3, $4)
         ON CONFLICT (insight_id, ${column}) DO UPDATE SET rationale = COALESCE(${links}.rationale, EXCLUDED.rationale)`,
        [accountId, insight.id, id, proposal.rationale || null]
      );
      await recordEvent(client, {
        accountId,
        insightId: insight.id,
        action: 'proposal_adopted',
        actorId,
        details: { kind: proposal.kind, id: String(id), proposal },
      });
    }
    if (kept.length < insight.proposed_links.length) {
      await client.query(`UPDATE insights SET proposed_links = $1::jsonb WHERE id = $2`, [
        JSON.stringify(kept),
        insight.id,
      ]);
    }
  }
}

module.exports = { adoptProposals };
