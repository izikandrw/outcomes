const pool = require('../db');
const { verifyToken } = require('../lib/auth');

// Resolves the Bearer token to a user and sets req.user = { id, email, role,
// accountId }. Looked up per request so removed users lose access at once.
async function requireAuth(req, res, next) {
  try {
    const match = /^Bearer (.+)$/.exec(req.headers.authorization || '');
    const userId = match && verifyToken(match[1]);
    if (!userId) return res.status(401).json({ error: 'sign in required' });
    const { rows } = await pool.query(
      'SELECT id, email, role, account_id FROM users WHERE id = $1',
      [userId]
    );
    if (rows.length === 0) return res.status(401).json({ error: 'sign in required' });
    const user = rows[0];
    req.user = { id: user.id, email: user.email, role: user.role, accountId: String(user.account_id) };
    next();
  } catch (err) {
    next(err);
  }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'admin only' });
  next();
}

module.exports = { requireAuth, requireAdmin };
