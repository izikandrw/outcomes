const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL || 'postgres://localhost:5432/outcomes';

// Hosted Postgres (Neon, Render, etc.) requires SSL and presents a cert not in
// the default CA store; local dev against a plain localhost instance does not.
const pool = new Pool({
  connectionString,
  ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
});

module.exports = pool;
