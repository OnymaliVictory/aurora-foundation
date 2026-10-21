const { db } = require('./db');
const err = (status, msg) => Object.assign(new Error(msg), { status, public: msg });
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const hits = new Map();
// Simple in-memory limiter (per server instance). Good first line of defence; add Upstash/Redis later for global limits.
const rateLimit = (max, ms = 60000) => (req, _res, next) => {
  const k = `${req.ip}|${req.method}|${req.baseUrl}${req.path}`, now = Date.now();
  const h = (hits.get(k) || []).filter(t => now - t < ms);
  if (h.length >= max) return next(err(429, 'Too many requests. Please wait a moment and try again.'));
  h.push(now); hits.set(k, h); next();
};
async function loadUser(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  if (!token) return null;
  const { data, error } = await db().auth.getUser(token);
  if (error || !data.user) return null;
  const { data: p } = await db().from('profiles').select('*').eq('id', data.user.id).single();
  return p ? { ...p, email: data.user.email } : null;
}
const optionalAuth = wrap(async (req, _r, next) => { req.user = await loadUser(req); next(); });
const requireAuth = wrap(async (req, _r, next) => {
  const u = await loadUser(req);
  if (!u) throw err(401, 'Please log in to continue.');
  if (u.suspended) throw err(403, 'This account is suspended. Please contact support.');
  req.user = u; next();
});
const requireRole = (...roles) => (req, _r, next) => roles.includes(req.user.role) ? next() : next(err(403, 'You do not have permission to do that.'));
const isUuid = v => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v));
const needUuid = v => { if (!isUuid(v)) throw err(400, 'Invalid id.'); return v; };
const audit = (actor, action, type, id, meta = {}) => db().from('audit_log').insert({ actor_id: actor, action, target_type: type, target_id: String(id), meta });
const notify = (user_id, kind, body) => db().from('notifications').insert({ user_id, kind, body });
const text = (v, max) => String(v ?? '').trim().slice(0, max);
module.exports = { err, wrap, rateLimit, optionalAuth, requireAuth, requireRole, isUuid, needUuid, audit, notify, text };
