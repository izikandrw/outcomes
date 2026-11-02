// Applies any migrations/NNN_*.sql not yet recorded in schema_migrations.
// Runs before the server starts (see render.yaml), so every deploy migrates.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const DIR = path.join(__dirname, '..', 'migrations');
// Databases that predate the tracking table already have these applied.
const BASELINE_THROUGH = '004';
const LOCK_KEY = 727274;
const LOCK_WAIT_MS = 60 * 1000;

// Migrations serialise on a session-level advisory lock, which only works on a
// connection that is really ours. Through a pooler (Neon's "-pooler" host is
// pgbouncer) the server connection outlives the script and the lock leaks to
// whoever is handed that connection next, blocking every later deploy. So
// connect to the direct host: DATABASE_URL_DIRECT, or DATABASE_URL with
// "-pooler" taken out of the hostname.
function directUrl() {
  const raw = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL || 'postgres://localhost:5432/outcomes';
  const url = new URL(raw);
  url.hostname = url.hostname.replace('-pooler.', '.');
  return url.toString();
}

// Waits for the lock rather than blocking on it forever: a lock still held
// after LOCK_WAIT_MS fails the deploy (the running version keeps serving) and
// names the session holding it.
async function acquireLock(client) {
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    const { rows: [{ locked }] } = await client.query('SELECT pg_try_advisory_lock($1) AS locked', [LOCK_KEY]);
    if (locked) return;
    if (Date.now() > deadline) {
      const { rows } = await client.query(
        `SELECT a.pid, a.application_name, a.state, a.backend_start
           FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid
          WHERE l.locktype = 'advisory' AND l.objid = $1 AND l.granted`,
        [LOCK_KEY]
      );
      throw new Error(
        `migration lock ${LOCK_KEY} still held after ${LOCK_WAIT_MS / 1000}s by ${JSON.stringify(rows)}; ` +
          'if no migration is running, end that session with pg_terminate_backend(pid)'
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

async function main() {
  const connectionString = directUrl();
  const client = new Client({
    connectionString,
    ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    // Serialise concurrent deploys.
    await acquireLock(client);

    // Migrations alter the schema create_db.sql builds, so they can't start from
    // nothing. Stop before touching the database, so it can still be built.
    const { rows: [{ built }] } = await client.query(
      "SELECT to_regclass('users') IS NOT NULL AS built");
    if (!built) {
      throw new Error('this database has no schema: run `psql -d <database> -f create_db.sql`, then migrate again');
    }

    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

    const files = fs.readdirSync(DIR).filter((f) => /^\d+_.*\.sql$/.test(f)).sort();

    // Nothing recorded yet, however the tracking table came to exist.
    const { rows: recorded } = await client.query('SELECT 1 FROM schema_migrations LIMIT 1');
    if (recorded.length === 0) {
      for (const f of files.filter((f) => f.slice(0, 3) <= BASELINE_THROUGH)) {
        await client.query(
          'INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [f]);
      }
      console.log(`Baselined existing database through ${BASELINE_THROUGH}`);
    }

    const { rows } = await client.query('SELECT name FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.name));

    for (const f of files.filter((f) => !applied.has(f))) {
      console.log(`Applying ${f}`);
      await client.query(fs.readFileSync(path.join(DIR, f), 'utf8'));
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [f]);
    }
    console.log('Migrations up to date');
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {});
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
