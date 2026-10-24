const express = require('express'); const { db } = require('./lib/db');
const app = express();
app.set('trust proxy', 1); app.disable('x-powered-by');
app.use(express.json({ limit: '5mb' }));   // base64 photos (client compresses to ~300KB)
app.get('/api/health', (_q, res) => res.json({ ok: true }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/locations', require('./routes/locations'));
app.use('/api/properties', require('./routes/properties'));
app.use('/api/companies', require('./routes/companies'));
app.use('/api/admin', require('./routes/admin'));
const crm = require('./routes/crm');
app.use('/api/crm', crm.crm); app.use('/api/agents', crm.agents); app.use('/api', crm.misc);
app.use('/api', require('./routes/engage'));
// Daily job (Vercel cron): expire listings older than 60 days. Needs CRON_SECRET.
app.get('/api/cron/expire', async (req, res, next) => {
  try {
    if (!process.env.CRON_SECRET || req.headers.authorization !== 'Bearer ' + process.env.CRON_SECRET) return res.status(401).json({ error: 'Not allowed.' });
    await db().from('properties').update({ status: 'expired' }).eq('status', 'active').lt('expires_at', new Date().toISOString()); res.json({ ok: true });
  } catch (e) { next(e); }
});
app.use('/api', (_q, res) => res.status(404).json({ error: 'Not found.' }));
// Mask server errors: log details, return a friendly message.
app.use((e, req, res, _next) => {
  const status = e.status || 500;
  if (status >= 500) console.error('API error', req.method, req.path, e && e.message);
  res.status(status).json({ error: e.public || (status < 500 && e.message) || 'Something went wrong. Please try again.', ...(e.clash ? { clash: true } : {}) });
});
module.exports = app;
