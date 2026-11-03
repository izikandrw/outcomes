const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const LOGIN = { account_id: '7', email: 'collector+7@outcomes.invalid', password: 'not-for-the-model', created: true };
const API = 'https://api.example.com';
let dir;
let saveCollectorLogin;

beforeEach(async () => {
  ({ saveCollectorLogin } = await import('../mcp/src/collectorLogin.js'));
  dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'collector-login-')), 'creds');
});

afterEach(() => fs.rmSync(path.dirname(dir), { recursive: true, force: true }));

const mode = (file) => fs.statSync(file).mode & 0o777;

test('the password goes to a private file and never into what the model sees', async () => {
  const result = await saveCollectorLogin(LOGIN, { apiUrl: API, dir });

  assert.ok(!JSON.stringify(result).includes(LOGIN.password));
  assert.equal(result.credentials_file, path.join(dir, 'collector-7.env'));
  assert.equal(mode(dir), 0o700);
  assert.equal(mode(result.credentials_file), 0o600);
  assert.equal(
    fs.readFileSync(result.credentials_file, 'utf8'),
    `OUTCOMES_API_URL=${API}\nOUTCOMES_EMAIL=${LOGIN.email}\nOUTCOMES_PASSWORD=${LOGIN.password}\n`
  );
});

test('replacing a login overwrites the file and tightens a loose one', async () => {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'collector-7.env');
  fs.writeFileSync(file, 'old', { mode: 0o644 });

  await saveCollectorLogin({ ...LOGIN, created: false }, { apiUrl: API, dir });

  assert.equal(mode(file), 0o600);
  assert.ok(!fs.readFileSync(file, 'utf8').includes('old'));
});

test('the register command reads credentials from the file and gets its own server name', async () => {
  const { register_command: command } = await saveCollectorLogin(LOGIN, { apiUrl: API, dir });

  assert.match(command, /claude mcp add outcomes-collector-7 /);
  assert.match(command, /OUTCOMES_TOOLSET=collector/);
  assert.match(command, /OUTCOMES_PASSWORD="\$OUTCOMES_PASSWORD"/);
  assert.ok(command.includes(path.join(dir, 'collector-7.env')));
});
