// The insight collector agent signs in as a user with role 'collector'. It
// needs to read the account (to link insights to outcomes and projects) and to
// suggest insights; nothing else. The insights router narrows it further, so a
// suggestion it creates is always unvalidated.
function collectorScope(req, res, next) {
  if (req.user.role !== 'collector') return next();
  if (req.method === 'GET') return next();
  if (req.method === 'POST' && /^\/\d+\/insights\/?$/.test(req.path)) return next();
  res.status(403).json({ error: 'the insight collector may only read and suggest insights' });
}

module.exports = collectorScope;
