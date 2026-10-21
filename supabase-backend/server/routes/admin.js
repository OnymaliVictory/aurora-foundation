const r = require('express').Router(); const { db } = require('../lib/db');
const { wrap, rateLimit, requireAuth, requireRole, needUuid, err, text, audit, notify } = require('../lib/mw');
r.use(rateLimit(120), requireAuth, requireRole('admin'));
const count = async (t, f = q => q) => (await f(db().from(t).select('id', { count: 'exact', head: true }))).count || 0;
r.get('/overview', wrap(async (_q, res) => res.json({
  users: await count('profiles'), listings_active: await count('properties', q => q.eq('status', 'active')),
  listings_pending: await count('properties', q => q.eq('status', 'pending')), enquiries: await count('enquiries'),
  reports_open: await count('reports', q => q.eq('status', 'open')), verifications_pending: await count('agent_verifications', q => q.eq('status', 'pending')) })));
r.get('/verifications', wrap(async (_q, res) => {
  const { data } = await db().from('agent_verifications').select('*, user:user_id(full_name,phone,role)').eq('status', 'pending').order('created_at'); res.json({ items: data });
}));
r.post('/verifications/:id/decide', wrap(async (req, res) => {
  const ok = req.body?.approve === true, reason = text(req.body?.reason, 300);
  if (!ok && !reason) throw err(400, 'Please give a reason for rejecting.');
  const { data: v } = await db().from('agent_verifications').select('*').eq('id', needUuid(req.params.id)).single(); if (!v) throw err(404, 'Not found.');
  await db().from('agent_verifications').update({ status: ok ? 'approved' : 'rejected', reason, reviewed_by: req.user.id, reviewed_at: new Date().toISOString() }).eq('id', v.id);
  await db().from('profiles').update({ verified: ok }).eq('id', v.user_id);
  await notify(v.user_id, 'verification', ok ? 'You are now a Verified agent' : 'Verification rejected: ' + reason);
  await audit(req.user.id, ok ? 'verify_approve' : 'verify_reject', 'profile', v.user_id, { reason }); res.json({ ok: true });
}));
r.get('/properties', wrap(async (req, res) => {
  const { data } = await db().from('properties').select('id,title,purpose,price,state,lga,created_at, owner:owner_id(full_name,verified), property_images(url,is_cover)')
    .eq('status', ['pending', 'active', 'rejected'].includes(req.query.status) ? req.query.status : 'pending').order('created_at').limit(100); res.json({ items: data });
}));
r.post('/properties/:id/decide', wrap(async (req, res) => {
  const ok = req.body?.approve === true, reason = text(req.body?.reason, 300);
  const { data: p } = await db().from('properties').select('id,owner_id,title,owner:owner_id(verified)').eq('id', needUuid(req.params.id)).single(); if (!p) throw err(404, 'Not found.');
  if (ok && !p.owner.verified) throw err(409, 'Verify this agent first. Listings only go public for verified accounts.');
  if (!ok && !reason) throw err(400, 'Please give a reason for rejecting.');
  await db().from('properties').update(ok ? { status: 'active', auto_hidden: false, reject_reason: null, expires_at: new Date(Date.now() + 60 * 864e5).toISOString() } : { status: 'rejected', reject_reason: reason }).eq('id', p.id);
  await notify(p.owner_id, 'listing', ok ? `“${p.title}” is now live` : `“${p.title}” was rejected: ${reason}`);
  await audit(req.user.id, ok ? 'listing_approve' : 'listing_reject', 'property', p.id, { reason }); res.json({ ok: true });
}));
r.post('/properties/:id/documents/:type/verify', wrap(async (req, res) => {
  const { error } = await db().from('property_documents').update({ state: 'verified', verified_by: req.user.id, verified_at: new Date().toISOString() }).eq('property_id', needUuid(req.params.id)).eq('doc_type', text(req.params.type, 40));
  if (error) throw error; await audit(req.user.id, 'doc_verify', 'property', req.params.id, { type: req.params.type }); res.json({ ok: true });
}));
r.get('/reports', wrap(async (_q, res) => {
  const { data } = await db().from('reports').select('*, property:property_id(id,title,auto_hidden)').eq('status', 'open').order('created_at').limit(100); res.json({ items: data });
}));
r.post('/reports/:id/resolve', wrap(async (req, res) => {
  const action = req.body?.action; if (!['dismiss', 'remove'].includes(action)) throw err(400, 'Invalid action.');
  const { data: rep } = await db().from('reports').select('*').eq('id', needUuid(req.params.id)).single(); if (!rep) throw err(404, 'Not found.');
  await db().from('reports').update({ status: action === 'remove' ? 'actioned' : 'dismissed' }).eq('property_id', rep.property_id).eq('status', 'open');
  await db().from('properties').update(action === 'remove' ? { status: 'removed' } : { auto_hidden: false }).eq('id', rep.property_id);
  await audit(req.user.id, 'report_' + action, 'property', rep.property_id); res.json({ ok: true });
}));
r.get('/users', wrap(async (_q, res) => {
  const { data } = await db().from('profiles').select('id,full_name,role,verified,suspended,created_at').order('created_at', { ascending: false }).limit(100); res.json({ items: data });
}));
r.post('/users/:id/suspend', wrap(async (req, res) => {
  const id = needUuid(req.params.id); if (id === req.user.id) throw err(400, 'You cannot suspend yourself.');
  await db().from('profiles').update({ suspended: req.body?.suspended === true }).eq('id', id); await audit(req.user.id, 'suspend', 'profile', id, { suspended: req.body?.suspended === true }); res.json({ ok: true });
}));
r.get('/verifications/:id/doc-url', wrap(async (req, res) => {
  const { data: v } = await db().from('agent_verifications').select('doc_path').eq('id', needUuid(req.params.id)).single();
  if (!v?.doc_path) throw err(404, 'No document uploaded.');
  const { data } = await db().storage.from('verification-docs').createSignedUrl(v.doc_path, 90); res.json({ url: data.signedUrl });
}));
r.post('/teams', wrap(async (req, res) => {
  const name = text(req.body?.name, 80); if (!name) throw err(400, 'Team name is required.');
  const { data: t, error } = await db().from('teams').insert({ name, manager_id: req.body.manager_id || null }).select().single(); if (error) throw error;
  if (req.body.manager_id) await db().from('profiles').update({ role: 'manager', team_id: t.id }).eq('id', needUuid(req.body.manager_id));
  await audit(req.user.id, 'team_create', 'team', t.id); res.status(201).json({ team: t });
}));
r.get('/teams', wrap(async (_q, res) => { const { data } = await db().from('teams').select('*').order('created_at'); res.json({ items: data }); }));
r.post('/users/:id/team', wrap(async (req, res) => {
  const role = req.body?.role; if (role && !['agent', 'owner', 'manager'].includes(role)) throw err(400, 'Invalid role.');
  await db().from('profiles').update({ team_id: req.body?.team_id || null, ...(role ? { role } : {}) }).eq('id', needUuid(req.params.id)); await audit(req.user.id, 'user_team', 'profile', req.params.id, req.body); res.json({ ok: true });
}));
r.get('/audit', wrap(async (_q, res) => { const { data } = await db().from('audit_log').select('*').order('created_at', { ascending: false }).limit(100); res.json({ items: data }); }));
module.exports = r;
