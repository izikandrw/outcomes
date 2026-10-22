const crypto = require('crypto');

// Passwords: scrypt with a per-user salt, stored as "salt:hash" (hex).
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  const [saltHex, hashHex] = stored.split(':');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

// Sessions: a minimal HS256 JWT carrying the user id. Everything else (role,
// account) is re-read from the database on each request so removals and role
// changes take effect immediately.
const SESSION_SECONDS = 60 * 60 * 24 * 7;

function secret() {
  const value = process.env.JWT_SECRET;
  if (!value) {
    if (process.env.NODE_ENV === 'production') throw new Error('JWT_SECRET must be set');
    return 'dev-only-insecure-secret';
  }
  return value;
}

const b64 = (input) => Buffer.from(input).toString('base64url');
const sign = (data) => crypto.createHmac('sha256', secret()).update(data).digest('base64url');

function signToken(userId) {
  const header = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64(JSON.stringify({ sub: String(userId), exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS }));
  return `${header}.${payload}.${sign(`${header}.${payload}`)}`;
}

// Returns the user id, or null if the token is malformed, forged or expired.
function verifyToken(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const expected = Buffer.from(sign(`${parts[0]}.${parts[1]}`));
  const given = Buffer.from(parts[2]);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  try {
    const { sub, exp } = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    return exp > Date.now() / 1000 ? sub : null;
  } catch {
    return null;
  }
}

// Invite tokens are random; only their hash is stored.
const newInviteToken = () => crypto.randomBytes(24).toString('base64url');
const hashInviteToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

module.exports = { hashPassword, verifyPassword, signToken, verifyToken, newInviteToken, hashInviteToken };
