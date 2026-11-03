// Creates the login the insight collector agent uses (role 'collector': it can
// read the account and suggest insights, nothing else; see
// product/agents/insight-collector/design.md), and prints the command that
// registers a collector-only MCP server with Claude Code.
//
//   npm run collector                       for the default (dev) account
//   npm run collector -- --account "Acme"   for another account
//
// Running it again for the same account issues a new password and signs out
// the old one. Runs against whatever DATABASE_URL points at. Without database
// access, an admin can use POST /accounts/:id/collector or the MCP server's
// create_collector_login tool instead.
require('dotenv').config();
const path = require('path');
const pool = require('../src/db');
const { issueCollectorLogin } = require('../src/lib/collectorLogin');

const DEV_EMAIL = 'isaac.stennett@gmail.com';

function parseArgs(argv) {
  const args = { account: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--account') args.account = argv[++i];
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  return args;
}

// Same default as the seed script: the account DEV_AUTO_LOGIN signs in to.
async function findAccount(name) {
  const { rows } = name
    ? await pool.query('SELECT * FROM accounts WHERE name = $1 ORDER BY id LIMIT 1', [name])
    : await pool.query(
        'SELECT a.* FROM users u JOIN accounts a ON a.id = u.account_id WHERE lower(u.email) = $1',
        [DEV_EMAIL]
      );
  if (!rows[0]) throw new Error(name ? `no account named "${name}"` : `no account for ${DEV_EMAIL}; sign in once or pass --account`);
  return rows[0];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const account = await findAccount(args.account);
  const { email, password, created } = await issueCollectorLogin(pool, account.id, { replace: true });

  const server = path.join(__dirname, '..', 'mcp', 'src', 'server.js');
  const apiUrl = process.env.OUTCOMES_API_URL || `http://localhost:${process.env.PORT || 3000}`;
  console.log(`${created ? 'Created' : 'Issued a new password for'} the insight collector of "${account.name}" (id ${account.id}).`);
  console.log('\nRegister it with Claude Code (the API must be running):\n');
  console.log(
    `claude mcp add outcomes-collector -e OUTCOMES_TOOLSET=collector -e OUTCOMES_API_URL=${apiUrl} ` +
      `-e OUTCOMES_EMAIL=${email} -e OUTCOMES_PASSWORD=${password} -- node "${server}"`
  );
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
