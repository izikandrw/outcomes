const express = require('express');
const crypto = require('crypto');
const pool = require('../db');
const { hashPassword, verifyPassword, signToken, hashInviteToken } = require('../lib/auth');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

const MIN_PASSWORD = 8;
const normEmail = (email) => String(email || '').trim().toLowerCase();
const validEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

function session(user, account) {
  return {
    token: signToken(user.id),
    user: { id: user.id, email: user.email, role: user.role },
    account: { id: account.id, name: account.name },
  };
}

function checkCredentials(email, password) {
  if (!validEmail(email)) return 'a valid email is required';
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
    return `password must be at least ${MIN_PASSWORD} characters`;
  }
  return null;
}

// Creates a new account with its first user, who becomes its admin.
router.post('/signup', async (req, res, next) => {
  const email = normEmail(req.body.email);
  const { password, accountName } = req.body;
  const problem = checkCredentials(email, password) || (!accountName?.trim() && 'account name is required');
  if (problem) return res.status(400).json({ error: problem });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const account = (await client.query('INSERT INTO accounts (name) VALUES ($1) RETURNING *', [accountName.trim()])).rows[0];
    // The whole company is the first team; later teams nest beneath it.
    await client.query('INSERT INTO teams (account_id, name) VALUES ($1, $2)', [account.id, account.name]);
    const user = (
      await client.query(
        "INSERT INTO users (account_id, email, password_hash, role) VALUES ($1, $2, $3, 'admin') RETURNING *",
        [account.id, email, hashPassword(password)]
      )
    ).rows[0];
    await client.query('COMMIT');
    res.status(201).json(session(user, account));
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(409).json({ error: 'that email is already registered' });
    next(err);
  } finally {
    client.release();
  }
});

router.post('/login', async (req, res, next) => {
  const email = normEmail(req.body.email);
  const { password } = req.body;
  try {
    const { rows } = await pool.query(
      `SELECT u.*, a.name AS account_name FROM users u JOIN accounts a ON a.id = u.account_id
       WHERE lower(u.email) = $1`,
      [email]
    );
    const user = rows[0];
    if (!user || typeof password !== 'string' || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'incorrect email or password' });
    }
    res.json(session(user, { id: user.account_id, name: user.account_name }));
  } catch (err) {
    next(err);
  }
});

// Shows an invitee what they are joining before they pick a password.
router.get('/invites/:token', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT i.email, i.role, a.name AS account_name FROM invites i JOIN accounts a ON a.id = i.account_id
       WHERE i.token_hash = $1 AND i.accepted_at IS NULL AND i.expires_at > now()`,
      [hashInviteToken(req.params.token)]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'this invite is invalid or has expired' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post('/invites/:token/accept', async (req, res, next) => {
  const { password } = req.body;
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
    return res.status(400).json({ error: `password must be at least ${MIN_PASSWORD} characters` });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Claiming the row first makes the invite single-use even under races.
    const invite = (
      await client.query(
        `UPDATE invites SET accepted_at = now()
         WHERE token_hash = $1 AND accepted_at IS NULL AND expires_at > now() RETURNING *`,
        [hashInviteToken(req.params.token)]
      )
    ).rows[0];
    if (!invite) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'this invite is invalid or has expired' });
    }
    const user = (
      await client.query(
        'INSERT INTO users (account_id, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING *',
        [invite.account_id, invite.email, hashPassword(password), invite.role]
      )
    ).rows[0];
    const account = (await client.query('SELECT * FROM accounts WHERE id = $1', [invite.account_id])).rows[0];
    await client.query('COMMIT');
    res.status(201).json(session(user, account));
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(409).json({ error: 'that email is already registered' });
    next(err);
  } finally {
    client.release();
  }
});

// Shows whose password a reset link is for before they choose a new one.
router.get('/password-resets/:token', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.email FROM password_resets r JOIN users u ON u.id = r.user_id
       WHERE r.token_hash = $1 AND r.used_at IS NULL AND r.expires_at > now()`,
      [hashInviteToken(req.params.token)]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'this reset link is invalid or has expired' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// Sets the new password, signs the user out of every other session and signs
// them in here.
router.post('/password-resets/:token', async (req, res, next) => {
  const { password } = req.body;
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
    return res.status(400).json({ error: `password must be at least ${MIN_PASSWORD} characters` });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Claiming the row first makes the link single-use even under races.
    const reset = (
      await client.query(
        `UPDATE password_resets SET used_at = now()
         WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() RETURNING user_id`,
        [hashInviteToken(req.params.token)]
      )
    ).rows[0];
    if (!reset) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'this reset link is invalid or has expired' });
    }
    // The app's clock, not the database's, since requireAuth compares this with
    // the iat the app signs into the new session.
    const user = (
      await client.query(
        'UPDATE users SET password_hash = $1, password_changed_at = $2 WHERE id = $3 RETURNING *',
        [hashPassword(password), new Date(), reset.user_id]
      )
    ).rows[0];
    const account = (await client.query('SELECT * FROM accounts WHERE id = $1', [user.account_id])).rows[0];
    await client.query('COMMIT');
    res.json(session(user, account));
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// Local development only: signs in as a fixed admin of an "outcomes" account,
// creating both on first use. Off unless DEV_AUTO_LOGIN=true, and never in production.
const DEV_EMAIL = 'isaac.stennett@gmail.com';
const DEV_ACCOUNT = 'outcomes';

router.post('/dev-login', async (req, res, next) => {
  if (process.env.DEV_AUTO_LOGIN !== 'true' || process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'not found' });
  }
  try {
    const existing = (
      await pool.query(
        `SELECT u.*, a.name AS account_name FROM users u JOIN accounts a ON a.id = u.account_id
         WHERE lower(u.email) = $1`,
        [DEV_EMAIL]
      )
    ).rows[0];
    if (existing) {
      return res.json(session(existing, { id: existing.account_id, name: existing.account_name }));
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const account =
        (await client.query('SELECT * FROM accounts WHERE name = $1 ORDER BY id LIMIT 1', [DEV_ACCOUNT])).rows[0] ||
        (await client.query('INSERT INTO accounts (name) VALUES ($1) RETURNING *', [DEV_ACCOUNT])).rows[0];
      // Random password: this user is only reachable through dev-login.
      const user = (
        await client.query(
          "INSERT INTO users (account_id, email, password_hash, role) VALUES ($1, $2, $3, 'admin') RETURNING *",
          [account.id, DEV_EMAIL, hashPassword(crypto.randomBytes(24).toString('hex'))]
        )
      ).rows[0];
      await client.query('COMMIT');
      res.json(session(user, account));
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT id, name FROM accounts WHERE id = $1', [req.user.accountId]);
    const { id, email, role } = req.user;
    res.json({ user: { id, email, role }, account: rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
