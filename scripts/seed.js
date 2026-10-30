// Fills an account with a realistic sample company: a team tree, outcomes with
// targets and readings, projects on a roadmap, and the insights behind them.
//
//   npm run seed                       seed the default account
//   npm run seed -- --account "Acme"  seed (creating if needed) another account
//   npm run seed -- --reset            wipe the account's data first, then seed
//
// Runs against whatever DATABASE_URL points at, so it works on any database
// that has been migrated. The default account is the one DEV_AUTO_LOGIN signs
// in to (see /auth/dev-login): the account of isaac.stennett@gmail.com, or an
// account named "outcomes" if that user has not signed in yet.
//
// Without --reset it leaves an account that already has outcomes untouched.
require('dotenv').config();
const pool = require('../src/db');

const DEV_EMAIL = 'isaac.stennett@gmail.com';
const DEV_ACCOUNT = 'outcomes';
const DAY = 24 * 60 * 60 * 1000;

const daysAgo = (n) => new Date(Date.now() - n * DAY);
const daysFromNow = (n) => new Date(Date.now() + n * DAY);

function parseArgs(argv) {
  const args = { account: process.env.SEED_ACCOUNT || null, reset: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--reset') args.reset = true;
    else if (argv[i] === '--account') args.account = argv[++i];
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  return args;
}

// Picks the account to seed, creating it when it does not exist yet.
async function resolveAccount(client, name) {
  if (name) {
    const found = (await client.query('SELECT * FROM accounts WHERE name = $1 ORDER BY id LIMIT 1', [name])).rows[0];
    if (found) return found;
    return (await client.query('INSERT INTO accounts (name) VALUES ($1) RETURNING *', [name])).rows[0];
  }
  const dev = (
    await client.query(
      'SELECT a.* FROM users u JOIN accounts a ON a.id = u.account_id WHERE lower(u.email) = $1',
      [DEV_EMAIL]
    )
  ).rows[0];
  if (dev) return dev;
  const named = (await client.query('SELECT * FROM accounts WHERE name = $1 ORDER BY id LIMIT 1', [DEV_ACCOUNT])).rows[0];
  if (named) return named;
  return (await client.query('INSERT INTO accounts (name) VALUES ($1) RETURNING *', [DEV_ACCOUNT])).rows[0];
}

async function wipe(client, accountId) {
  // Children first; each statement is scoped to the one account.
  for (const table of [
    'measurements', 'targets', 'insight_outcomes', 'insight_projects', 'project_outcomes',
    'insights', 'outcomes', 'projects', 'teams',
  ]) {
    await client.query(`DELETE FROM ${table} WHERE account_id = $1`, [accountId]);
  }
}

// Deterministic wobble in [-1, 1] so re-seeding gives the same charts.
const wobble = (i) => Math.sin(i * 12.9898) * 0.5 + Math.cos(i * 78.233) * 0.5;

async function seed(client, account) {
  const accountId = account.id;
  const one = async (sql, params) => (await client.query(sql, params)).rows[0].id;

  const team = (name, parent) =>
    one('INSERT INTO teams (account_id, parent_team_id, name) VALUES ($1, $2, $3) RETURNING id', [accountId, parent, name]);
  const project = (teamId, name, description, start, end, parent = null) =>
    one(
      `INSERT INTO projects (account_id, team_id, parent_project_id, name, description, start_at, end_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [accountId, teamId, parent, name, description, start, end]
    );
  const outcome = (teamId, name, description, parent = null, projectId = null) =>
    one(
      `INSERT INTO outcomes (account_id, team_id, project_id, parent_outcome_id, name, description)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [accountId, teamId, projectId, parent, name, description]
    );
  const link = (table, aCol, a, bCol, b) =>
    client.query(`INSERT INTO ${table} (account_id, ${aCol}, ${bCol}) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [accountId, a, b]);
  const insight = (type, name, description, source, observedDaysAgo, dollars, area) =>
    one(
      `INSERT INTO insights (account_id, type, name, description, source, observed_at, dollar_impact, impact_area)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [accountId, type, name, description, source, daysAgo(observedDaysAgo), dollars, area]
    );

  // A target plus its readings. `progress` is how far along baseline -> target
  // the latest reading sits; readings are spaced `every` days apart, ending today.
  async function target(outcomeId, t) {
    const { name, description, unit, baseline, goal, progress, readings, every, dueIn, decimals = 0 } = t;
    const id = await one(
      `INSERT INTO targets (account_id, outcome_id, name, description, unit, baseline_value, target_value, baseline_at, due_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [accountId, outcomeId, name, description, unit, baseline, goal, daysAgo((readings - 1) * every), daysFromNow(dueIn)]
    );
    const span = goal - baseline;
    for (let i = 0; i < readings; i++) {
      const share = readings === 1 ? 0 : i / (readings - 1);
      const noise = i === 0 ? 0 : wobble(i + id) * Math.abs(span) * 0.04;
      const value = Number((baseline + span * progress * share + noise).toFixed(decimals));
      await client.query(
        'INSERT INTO measurements (account_id, target_id, value, measured_at) VALUES ($1, $2, $3, $4)',
        [accountId, id, value, daysAgo((readings - 1 - i) * every)]
      );
    }
    return id;
  }

  // The whole company is the first team (what signup creates); the rest nest beneath it.
  let root = (await client.query('SELECT id FROM teams WHERE account_id = $1 AND parent_team_id IS NULL ORDER BY id LIMIT 1', [accountId])).rows[0]?.id;
  if (!root) root = await team(account.name, null);

  const product = await team('Product', root);
  const onboarding = await team('Onboarding', product);
  const collaboration = await team('Collaboration', product);
  const platform = await team('Platform', root);
  const growth = await team('Growth', root);
  const success = await team('Customer Success', root);

  // Projects (outputs). Dates straddle today so the roadmap has past, current and upcoming work.
  const inviteFlow = await project(onboarding, 'Invite flow redesign', 'One-step invite from the empty workspace, with role presets.', daysAgo(40), daysFromNow(20));
  const inviteNudges = await project(onboarding, 'Invite reminder emails', 'Nudge admins who have not invited anyone by the end of day one.', daysAgo(10), daysFromNow(35), inviteFlow);
  const setupChecklist = await project(onboarding, 'Setup checklist', 'In-product checklist that tracks the steps to a working workspace.', daysFromNow(25), daysFromNow(80));
  const ssoWizard = await project(platform, 'Self-serve SSO wizard', 'Guided SAML setup with a live connection test.', daysAgo(60), daysAgo(5));
  const connectors = await project(growth, 'One-click data connectors', 'OAuth connectors for the three most requested sources.', daysAgo(20), daysFromNow(45));
  const sampleData = await project(growth, 'Sample data workspace', 'Pre-filled workspace so trials see value before connecting anything.', daysFromNow(10), daysFromNow(50));
  const commentThreads = await project(collaboration, 'Report comment threads', 'Inline, resolvable comments on every report.', daysAgo(5), daysFromNow(60));
  const helpSearch = await project(success, 'In-app help search', 'Search help articles from the product without leaving the page.', daysAgo(30), daysFromNow(15));

  // Outcomes (behavior changes), nested where one decomposes into another.
  const invites = await outcome(onboarding, 'Admins invite a teammate in their first session', 'A workspace with one person in it never becomes a habit. Inviting early is the strongest predictor of week-four retention.', null, inviteFlow);
  const accepts = await outcome(onboarding, 'Invited teammates accept within 48 hours', 'Invites that sit unopened for days rarely convert.', invites, inviteNudges);
  const checklist = await outcome(onboarding, 'New admins complete workspace setup in one sitting', 'Setup that spills across days is setup that never finishes.', null, setupChecklist);
  const sso = await outcome(platform, 'Admins finish SSO setup without contacting support', 'Enterprise deals stall on SSO. Every ticket here is a week of delay.', null, ssoWizard);
  const connect = await outcome(growth, 'Trial users connect a data source before day 3', 'Trials that see their own data convert at several times the rate of those that do not.', null, connectors);
  const sample = await outcome(growth, 'Trial users who cannot connect data explore a sample workspace', 'A fallback path for users blocked on credentials or approval.', connect, sampleData);
  const comments = await outcome(collaboration, 'Teams discuss reports in the product instead of exporting them', 'Exports leave the product, and the conversation with them.', null, commentThreads);
  const selfServe = await outcome(success, 'Customers answer common questions from help articles instead of filing tickets', 'Roughly half of tickets are questions an article already answers.', null, helpSearch);

  // Each outcome's home project supports it, and some projects support others too.
  for (const [p, o] of [
    [inviteFlow, invites], [inviteFlow, accepts], [inviteNudges, accepts], [setupChecklist, invites], [setupChecklist, checklist],
    [ssoWizard, sso], [connectors, connect], [connectors, sample], [sampleData, sample],
    [commentThreads, comments], [helpSearch, selfServe], [helpSearch, sso],
  ]) await link('project_outcomes', 'project_id', p, 'outcome_id', o);

  // Targets and readings: a mix of on-track, behind and barely started.
  await target(invites, { name: 'Admins who invite in their first session', description: 'Share of new admins sending at least one invite before their first session ends.', unit: '% of new admins', baseline: 41, goal: 60, progress: 0.55, readings: 9, every: 7, dueIn: 60 });
  await target(invites, { name: 'Median time to first invite', description: 'From workspace creation to the first invite sent.', unit: 'minutes', baseline: 38, goal: 10, progress: 0.4, readings: 9, every: 7, dueIn: 60 });
  await target(accepts, { name: 'Invites accepted within 48 hours', description: 'Share of invites accepted inside two days of sending.', unit: '% of invites', baseline: 34, goal: 55, progress: 0.2, readings: 5, every: 7, dueIn: 75 });
  await target(checklist, { name: 'Admins who finish setup in one sitting', description: 'Setup completed within a single 60-minute window.', unit: '% of new admins', baseline: 27, goal: 50, progress: 0.05, readings: 4, every: 14, dueIn: 120 });
  await target(sso, { name: 'SSO tickets per week', description: 'Support tickets tagged "sso-setup".', unit: 'tickets', baseline: 46, goal: 8, progress: 0.85, readings: 12, every: 7, dueIn: 14 });
  await target(sso, { name: 'Median SSO setup time', description: 'From first opening SSO settings to a passing connection test.', unit: 'hours', baseline: 52, goal: 4, progress: 0.7, readings: 12, every: 7, dueIn: 14, decimals: 1 });
  await target(connect, { name: 'Trials with a connected source by day 3', description: 'Trials with at least one source syncing 72 hours after signup.', unit: '% of trials', baseline: 22, goal: 45, progress: 0.35, readings: 8, every: 7, dueIn: 50 });
  await target(sample, { name: 'Blocked trials opening the sample workspace', description: 'Trials with no connected source that open the sample workspace.', unit: '% of blocked trials', baseline: 0, goal: 30, progress: 0, readings: 1, every: 7, dueIn: 90 });
  await target(comments, { name: 'Report exports per active team', description: 'Fewer exports means the conversation is staying in the product.', unit: 'exports / week', baseline: 18, goal: 9, progress: 0.1, readings: 6, every: 7, dueIn: 90 });
  await target(selfServe, { name: 'Weekly support tickets', description: 'All inbound tickets, excluding billing.', unit: 'tickets', baseline: 340, goal: 200, progress: 0.3, readings: 10, every: 7, dueIn: 45 });

  // Insights (evidence), each linked to whatever it justifies.
  const evidence = [
    ['interview', '11 of 14 interviewed admins never invited anyone during setup', 'Most said they wanted to "get it working first" and then forgot.', 'Admin interviews, Sept batch', 55, null, 'activation', [invites, checklist], [inviteFlow, setupChecklist]],
    ['funnel', 'Invite modal drops 63% of admins at the role picker', 'Of admins who open the invite modal, 37% reach "send".', 'Funnel: invite_modal_opened → invite_sent', 48, 86000, 'activation', [invites], [inviteFlow]],
    ['experiment', 'Day-one reminder email lifted acceptance 9 points', 'Holdout test on 2,400 invites; small sample on enterprise plans.', 'Experiment EXP-214', 20, null, 'retention', [accepts], [inviteNudges]],
    ['support_ticket', 'SSO tickets cluster on the SAML certificate step', '31 of the last 46 tickets mention the signing certificate format.', 'Zendesk tag sso-setup', 70, 120000, 'expansion', [sso], [ssoWizard]],
    ['support_ticket', 'Top 12 ticket topics all have an existing help article', 'Customers did not find the article, or did not look.', 'Zendesk topic report, last 90 days', 35, 54000, 'cost', [selfServe], [helpSearch]],
    ['session_recording', 'Trial users stall on the OAuth consent screen', 'Seven of ten recordings show a user leaving when asked for admin approval.', 'Session recordings, trial cohort', 30, null, 'acquisition', [connect, sample], [connectors, sampleData]],
    ['funnel', 'Trials with a source by day 3 convert at 4.1x', '38% vs 9% trial-to-paid conversion.', 'Funnel: trial cohorts, Q2', 62, 410000, 'acquisition', [connect], [connectors]],
    ['interview', 'Analysts export to PDF "so people can comment on it"', 'Four of six analysts described pasting screenshots into chat to discuss a chart.', 'Analyst interviews', 15, null, 'retention', [comments], [commentThreads]],
  ];
  for (const [type, name, desc, source, ago, dollars, area, outcomes, projects] of evidence) {
    const id = await insight(type, name, desc, source, ago, dollars, area);
    for (const o of outcomes) await link('insight_outcomes', 'insight_id', id, 'outcome_id', o);
    for (const p of projects) await link('insight_projects', 'insight_id', id, 'project_id', p);
  }

  // Suggestions from the insight collector, waiting in the review queue. They
  // carry where they came from and why each link was made, and don't count as
  // evidence until someone approves them.
  const suggestions = [
    ['sales_call', 'Globex admins abandoned SSO setup after two days and kept using passwords', 'Renewal call; their IT lead said the IdP metadata step failed silently. Renewal flagged at risk.', 'attention', 'Globex renewal call · 14:20', 'honestly we gave up on SSO after two days and just kept using passwords', true, 48000, 'retention',
      [[sso, 'An admin giving up on SSO without help is this behavior not happening.']], [[ssoWizard, 'The wizard targets the metadata step they got stuck on.']]],
    ['survey', '9 of 23 trial exit-survey respondents never found where to connect their data', null, 'csv', 'trial-exit-survey-oct.csv · rows 2–24', "couldn't figure out where to connect our warehouse", true, null, 'acquisition',
      [[connect, 'Respondents never connected a data source during the trial.']], [[connectors, 'Connectors are what they could not find.']]],
    ['feature_request', 'Support relayed that Initech wants audit-log export for their SOC 2 review', null, 'jira', 'PROD-2291', 'Initech asked again whether we can export audit logs for their SOC2 auditors', false, null, null, [], []],
  ];
  for (const [type, name, desc, system, externalId, excerpt, firsthand, dollars, area, outcomes, projects] of suggestions) {
    const id = await one(
      `INSERT INTO insights (account_id, type, name, description, observed_at, dollar_impact, impact_area,
         status, source_system, source_external_id, source_excerpt, firsthand)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'unvalidated', $8, $9, $10, $11) RETURNING id`,
      [accountId, type, name, desc, daysAgo(5), dollars, area, system, externalId, excerpt, firsthand]
    );
    for (const [o, why] of outcomes) {
      await client.query('INSERT INTO insight_outcomes (account_id, insight_id, outcome_id, rationale) VALUES ($1, $2, $3, $4)', [accountId, id, o, why]);
    }
    for (const [p, why] of projects) {
      await client.query('INSERT INTO insight_projects (account_id, insight_id, project_id, rationale) VALUES ($1, $2, $3, $4)', [accountId, id, p, why]);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const account = await resolveAccount(client, args.account);

    if (args.reset) {
      await wipe(client, account.id);
    } else {
      const { rows: [{ n }] } = await client.query('SELECT count(*)::int AS n FROM outcomes WHERE account_id = $1', [account.id]);
      if (n > 0) {
        await client.query('ROLLBACK');
        console.log(`Account "${account.name}" (id ${account.id}) already has ${n} outcome(s); nothing seeded. Use --reset to replace its data.`);
        return;
      }
    }

    await seed(client, account);
    await client.query('COMMIT');
    console.log(`Seeded account "${account.name}" (id ${account.id}).`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
