// Requires :accountId in the URL to be the signed-in user's own account, and
// exposes it as req.accountId so nested routers can scope every query to it.
// Another account's id looks the same as a missing one.
function accountScope(req, res, next) {
  if (String(req.params.accountId) !== req.user.accountId) {
    return res.status(404).json({ error: 'account not found' });
  }
  req.accountId = req.user.accountId;
  next();
}

module.exports = accountScope;
