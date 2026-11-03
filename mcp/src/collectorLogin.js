import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const defaultCredentialsDir = () => process.env.OUTCOMES_CREDENTIALS_DIR || join(homedir(), '.outcomes');

// Saves a collector login to a file only this user can read and returns what a
// model may see. Tool results land in the conversation, so the password must
// never be part of the return value; the register command reads it from the file.
export async function saveCollectorLogin(login, { apiUrl, dir = defaultCredentialsDir() }) {
  const file = join(dir, `collector-${login.account_id}.env`);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await writeFile(
    file,
    `OUTCOMES_API_URL=${apiUrl}\nOUTCOMES_EMAIL=${login.email}\nOUTCOMES_PASSWORD=${login.password}\n`,
    { mode: 0o600 }
  );
  await chmod(file, 0o600); // writeFile's mode only applies to a new file

  const server = fileURLToPath(new URL('./server.js', import.meta.url));
  return {
    email: login.email,
    created: login.created,
    credentials_file: file,
    register_command:
      `set -a; . "${file}"; set +a; claude mcp add outcomes-collector-${login.account_id} -e OUTCOMES_TOOLSET=collector ` +
      `-e OUTCOMES_API_URL="$OUTCOMES_API_URL" -e OUTCOMES_EMAIL="$OUTCOMES_EMAIL" -e OUTCOMES_PASSWORD="$OUTCOMES_PASSWORD" ` +
      `-- node "${server}"`,
    next_step: 'Run register_command, then restart Claude Code: a new MCP server only appears in a new session.',
  };
}
