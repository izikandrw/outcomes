// Applies any migrations/NNN_*.sql not yet recorded in schema_migrations.
// Runs before the server starts (see render.yaml), so every deploy migrates.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../src/db');

const DIR = path.join(__dirname, '..', 'migrations');
// Databases that predate the tracking table already have these applied.
const BASELINE_THROUGH = '004';

async function main() {
  const client = await pool.connect();
  try {
    // Serialise concurrent deploys.
    await client.query('SELECT pg_advisory_lock(727274)');

    const { rows: [{ tracked }] } = await client.query(
      "SELECT to_regclass('schema_migrations') IS NOT NULL AS tracked");
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

    const files = fs.readdirSync(DIR).filter((f) => /^\d+_.*\.sql$/.test(f)).sort();

    if (!tracked) {
      const { rows: [{ built }] } = await client.query(
        "SELECT to_regclass('users') IS NOT NULL AS built");
      if (built) {
        for (const f of files.filter((f) => f.slice(0, 3) <= BASELINE_THROUGH)) {
          await client.query(
            'INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [f]);
        }
        console.log(`Baselined existing database through ${BASELINE_THROUGH}`);
      }
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
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
