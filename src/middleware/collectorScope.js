// The insight collector agent signs in as a user with role 'collector'. It
// needs to read the account (to link insights to outcomes and projects), to
// suggest insights, and to record its runs; nothing else. The insights router
// narrows it further, so a suggestion it creates is always unvalidated.
const COLLECTOR_POSTS = /^\/\d+\/(insights|collection-runs(\/\d+\/(documents|finish))?)\/?$/;

function collectorScope(req, res, next) {
  if (req.user.role !== 'collector') return next();
  if (req.method === 'GET') return next();
  if (req.method === 'POST' && COLLECTOR_POSTS.test(req.path)) return next();
  res.status(403).json({ error: 'the insight collector may only read, suggest insights and record its runs' });
}

module.exports = collectorScope;
