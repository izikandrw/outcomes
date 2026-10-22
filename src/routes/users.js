const express = require('express');
const pool = require('../db');
const { requireAdmin } = require('../middleware/requireAuth');
const { newInviteToken, hashInviteToken } = require('../lib/auth');

const router = express.Router();

const INVITE_DAYS = 7;
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
