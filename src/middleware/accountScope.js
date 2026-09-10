const pool = require('../db');

// Confirms :accountId in the URL refers to a real account, and exposes it
// as req.accountId so nested routers can scope every query to it.
async function accountScope(req, res, next) {
  try {
    const { rows } = await pool.query('SELECT id FROM accounts WHERE id = $1', [req.params.accountId]);
    if (rows.length === 0) return res.status(404).json({ error: 'account not found' });
    req.accountId = req.params.accountId;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = accountScope;
