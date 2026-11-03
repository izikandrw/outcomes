const crypto = require('crypto');
const { hashPassword } = require('./auth');

// The login the insight collector agent uses (role 'collector'; see
// product/agents/insight-collector/design.md). An account has at most one.
//
// Returns { email, password, created }. The password is only ever available
// here. If the account already has a collector, returns null unless `replace`
// is set, because a new password signs out whatever is using the old one.
async function issueCollectorLogin(db, accountId, { replace = false } = {}) {
  const email = `collector+${accountId}@outcomes.invalid`;
  const password = crypto.randomBytes(18).toString('base64url');
  const passwordHash = hashPassword(password);

  const inserted = await db.query(
    `INSERT INTO users (account_id, email, password_hash, role) VALUES ($1, $2, $3, 'collector')
     ON CONFLICT (lower(email)) DO NOTHING RETURNING id`,
    [accountId, email, passwordHash]
  );
  if (inserted.rows.length > 0) return { email, password, created: true };
  if (!replace) return null;

  const updated = await db.query(
    `UPDATE users SET password_hash = $1, password_changed_at = now()
     WHERE lower(email) = $2 AND account_id = $3 AND role = 'collector'`,
    [passwordHash, email, accountId]
  );
  if (updated.rowCount === 0) throw new Error(`${email} is not this account's collector`);
  return { email, password, created: false };
}

module.exports = { issueCollectorLogin };
