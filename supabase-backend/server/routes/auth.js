const r = require('express').Router(); const { db } = require('../lib/db');
const { wrap, rateLimit, requireAuth, err, text } = require('../lib/mw');
r.get('/me', rateLimit(120), requireAuth, (req, res) => res.json({ user: req.user }));
// Profile update. A person may choose seeker / agent / owner for themselves; admin is never self-assignable.
r.patch('/me', rateLimit(20), requireAuth, wrap(async (req, res) => {
  const u = {}; const b = req.body || {};
  if (b.full_name !== undefined) u.full_name = text(b.full_name, 80);
  if (b.phone !== undefined) { u.phone = text(b.phone, 20).replace(/[^\d+]/g, ''); }
  if (b.role !== undefined) {
    if (!['seeker', 'agent', 'owner'].includes(b.role) || req.user.role === 'admin') throw err(400, 'Invalid role.');
    u.role = b.role;
  }
  if (!Object.keys(u).length) throw err(400, 'Nothing to update.');
  const { data, error } = await db().from('profiles').update(u).eq('id', req.user.id).select().single();
  if (error) throw error; res.json({ user: data });
}));
// Agent / owner verification request (documents upload comes in Phase 2; ID type + business details now)
r.post('/verification', rateLimit(5, 3600000), requireAuth, wrap(async (req, res) => {
  const b = req.body || {};
  if (!['nin', 'drivers_licence', 'voters_card', 'intl_passport'].includes(b.id_type)) throw err(400, 'Choose a valid ID type.');
  const { data: open } = await db().from('agent_verifications').select('id').eq('user_id', req.user.id).eq('status', 'pending');
  if (open?.length) throw err(409, 'You already have a verification request waiting for review.');
  const { error } = await db().from('agent_verifications').insert({ user_id: req.user.id, id_type: b.id_type, business_name: text(b.business_name, 120), cac_number: text(b.cac_number, 30) });
  if (error) throw error; res.status(201).json({ ok: true });
}));
r.get('/verification', requireAuth, wrap(async (req, res) => {
  const { data } = await db().from('agent_verifications').select('id,status,reason,created_at').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(1);
  res.json({ verification: data?.[0] || null });
}));
const { saveFile } = require('../lib/upload');
r.post('/verification-doc', rateLimit(5, 3600000), requireAuth, wrap(async (req, res) => {
  const { data: v } = await db().from('agent_verifications').select('id').eq('user_id', req.user.id).eq('status', 'pending').maybeSingle();
  if (!v) throw err(400, 'Submit the verification form first.');
  const f = await saveFile('verification-docs', req.user.id, req.body?.data);
  await db().from('agent_verifications').update({ doc_path: f.path }).eq('id', v.id); res.json({ ok: true });
}));
module.exports = r;
