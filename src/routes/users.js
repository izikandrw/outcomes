const express = require('express');
const pool = require('../db');
const { requireAdmin } = require('../middleware/requireAuth');
const { newInviteToken, hashInviteToken } = require('../lib/auth');
const { issueCollectorLogin } = require('../lib/collectorLogin');

const router = express.Router();

const INVITE_DAYS = 7;
const RESET_HOURS = 24;
const ROLES = ['admin', 'member'];

router.get('/users', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, email, role, created_at FROM users WHERE account_id = $1 ORDER BY id',
      [req.accountId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.delete('/users/:userId', requireAdmin, async (req, res, next) => {
  if (String(req.params.userId) === String(req.user.id)) {
    return res.status(400).json({ error: 'you cannot remove yourself' });
  }
  try {
    const { rowCount } = await pool.query('DELETE FROM users WHERE id = $1 AND account_id = $2', [
      req.params.userId,
      req.accountId,
    ]);
    if (rowCount === 0) return res.status(404).json({ error: 'user not found' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// The raw token is returned once, here; the admin shares it as a link. Any
// earlier unused link for the same user stops working.
router.post('/users/:userId/password-reset', requireAdmin, async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const user = (
      await client.query('SELECT id, email FROM users WHERE id = $1 AND account_id = $2', [
        req.params.userId,
        req.accountId,
      ])
    ).rows[0];
    if (!user) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'user not found' });
    }
    await client.query('DELETE FROM password_resets WHERE user_id = $1 AND used_at IS NULL', [user.id]);
    const token = newInviteToken();
    const { rows } = await client.query(
      `INSERT INTO password_resets (user_id, token_hash, created_by, expires_at)
       VALUES ($1, $2, $3, now() + make_interval(hours => $4))
       RETURNING expires_at`,
      [user.id, hashInviteToken(token), req.user.id, RESET_HOURS]
    );
    await client.query('COMMIT');
    res.status(201).json({ email: user.email, expires_at: rows[0].expires_at, token });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// Creates the account's insight collector login. The password is returned once,
// here. An existing collector stays signed in unless { replace: true } asks for
// a new password, which signs it out.
router.post('/collector', requireAdmin, async (req, res, next) => {
  try {
    const login = await issueCollectorLogin(pool, req.accountId, { replace: req.body?.replace === true });
    if (!login) {
      return res.status(409).json({
        error: 'this account already has a collector; pass replace: true to issue a new password and sign the current one out',
      });
    }
    res.set('Cache-Control', 'no-store');
    res.status(login.created ? 201 : 200).json({ account_id: req.accountId, ...login });
  } catch (err) {
    next(err);
  }
});

router.get('/invites', requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, email, role, expires_at, created_at FROM invites
       WHERE account_id = $1 AND accepted_at IS NULL AND expires_at > now() ORDER BY id`,
      [req.accountId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// The raw token is returned once, here; the admin shares it as a link.
router.post('/invites', requireAdmin, async (req, res, next) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const role = req.body.role || 'member';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'a valid email is required' });
  if (!ROLES.includes(role)) return res.status(400).json({ error: 'role must be admin or member' });
  try {
    const existing = await pool.query('SELECT 1 FROM users WHERE lower(email) = $1', [email]);
    if (existing.rows.length > 0) return res.status(409).json({ error: 'that email is already registered' });
    const token = newInviteToken();
    const { rows } = await pool.query(
      `INSERT INTO invites (account_id, email, role, token_hash, invited_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, now() + make_interval(days => $6))
       RETURNING id, email, role, expires_at, created_at`,
      [req.accountId, email, role, hashInviteToken(token), req.user.id, INVITE_DAYS]
    );
    res.status(201).json({ ...rows[0], token });
  } catch (err) {
    next(err);
  }
});

router.delete('/invites/:inviteId', requireAdmin, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM invites WHERE id = $1 AND account_id = $2 AND accepted_at IS NULL',
      [req.params.inviteId, req.accountId]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'invite not found' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
