const r = require('express').Router(); const { db } = require('../lib/db');
const { wrap, rateLimit, requireAuth, needUuid, err, text, notify } = require('../lib/mw');
// ---- favourites ----
r.get('/favourites', requireAuth, wrap(async (req, res) => {
  const { data } = await db().from('favourites').select('property:property_id(*, property_images(url,is_cover))').eq('user_id', req.user.id).order('created_at', { ascending: false });
  res.json({ items: data.map(d => d.property).filter(p => p && p.status === 'active') });
}));
r.post('/favourites/:pid', rateLimit(60), requireAuth, wrap(async (req, res) => {
  await db().from('favourites').upsert({ user_id: req.user.id, property_id: needUuid(req.params.pid) }); res.json({ ok: true });
}));
r.delete('/favourites/:pid', requireAuth, wrap(async (req, res) => {
  await db().from('favourites').delete().eq('user_id', req.user.id).eq('property_id', needUuid(req.params.pid)); res.json({ ok: true });
}));
// ---- enquiries (one thread per seeker per property) ----
r.post('/enquiries', rateLimit(10, 3600000), requireAuth, wrap(async (req, res) => {
  const msg = text(req.body?.message, 2000); if (msg.length < 3) throw err(400, 'Please write a short message.');
  const { data: p } = await db().from('properties').select('id,owner_id,title,status').eq('id', needUuid(req.body.property_id)).single();
  if (!p || p.status !== 'active') throw err(404, 'This property is no longer available.');
  if (p.owner_id === req.user.id) throw err(400, 'This is your own listing.');
  let { data: e } = await db().from('enquiries').select('*').eq('property_id', p.id).eq('seeker_id', req.user.id).maybeSingle();
  if (!e) ({ data: e } = await db().from('enquiries').insert({ property_id: p.id, seeker_id: req.user.id, agent_id: p.owner_id }).select().single());
  await db().from('enquiry_messages').insert({ enquiry_id: e.id, sender_id: req.user.id, body: msg });
  await db().from('enquiries').update({ needs_reply: true, last_message_at: new Date().toISOString() }).eq('id', e.id);
  await notify(p.owner_id, 'enquiry', `New enquiry on “${p.title}”`);
  res.status(201).json({ enquiry: e });
}));
r.get('/enquiries', requireAuth, wrap(async (req, res) => {
  const { data } = await db().from('enquiries').select('*, property:property_id(id,title), seeker:seeker_id(full_name), agent:agent_id(full_name)')
    .or(`seeker_id.eq.${req.user.id},agent_id.eq.${req.user.id}`).order('last_message_at', { ascending: false });
  res.json({ items: data });
}));
async function member(req) {
  const { data: e } = await db().from('enquiries').select('*').eq('id', needUuid(req.params.id)).single();
  if (!e || ![e.seeker_id, e.agent_id].includes(req.user.id)) throw err(404, 'Conversation not found.'); return e;
}
r.get('/enquiries/:id/messages', requireAuth, wrap(async (req, res) => {
  const e = await member(req);
  const { data } = await db().from('enquiry_messages').select('id,sender_id,body,created_at').eq('enquiry_id', e.id).order('created_at');
  res.json({ items: data, me: req.user.id });
}));
r.post('/enquiries/:id/messages', rateLimit(30), requireAuth, wrap(async (req, res) => {
  const e = await member(req); const body = text(req.body?.body, 2000); if (!body) throw err(400, 'Message is empty.');
  await db().from('enquiry_messages').insert({ enquiry_id: e.id, sender_id: req.user.id, body });
  await db().from('enquiries').update({ needs_reply: req.user.id === e.seeker_id, last_message_at: new Date().toISOString() }).eq('id', e.id);
  await notify(req.user.id === e.seeker_id ? e.agent_id : e.seeker_id, 'message', 'You have a new message');
  res.status(201).json({ ok: true });
}));
// ---- inspections ----
r.post('/inspections', rateLimit(10, 3600000), requireAuth, wrap(async (req, res) => {
  const when = new Date(req.body?.preferred_at);
  if (isNaN(when) || when < new Date() || when > new Date(Date.now() + 90 * 864e5)) throw err(400, 'Please choose a date within the next 90 days.');
  const { data: p } = await db().from('properties').select('id,owner_id,title,status').eq('id', needUuid(req.body.property_id)).single();
  if (!p || p.status !== 'active') throw err(404, 'This property is no longer available.');
  if (p.owner_id === req.user.id) throw err(400, 'This is your own listing.');
  const { error } = await db().from('inspections').insert({ property_id: p.id, seeker_id: req.user.id, agent_id: p.owner_id, preferred_at: when.toISOString(), notes: text(req.body.notes, 500) });
  if (error) throw error; await notify(p.owner_id, 'inspection', `Inspection requested for “${p.title}”`);
  res.status(201).json({ ok: true });
}));
r.get('/inspections', requireAuth, wrap(async (req, res) => {
  const { data } = await db().from('inspections').select('*, property:property_id(id,title), seeker:seeker_id(full_name)')
    .or(`seeker_id.eq.${req.user.id},agent_id.eq.${req.user.id}`).order('preferred_at');
  res.json({ items: data, me: req.user.id });
}));
r.patch('/inspections/:id', rateLimit(40), requireAuth, wrap(async (req, res) => {
  const { data: i } = await db().from('inspections').select('*').eq('id', needUuid(req.params.id)).single();
  if (!i || ![i.seeker_id, i.agent_id].includes(req.user.id)) throw err(404, 'Not found.');
  const st = req.body?.status; const isAgent = req.user.id === i.agent_id;
  if (!['confirmed', 'completed', 'cancelled', 'no_show'].includes(st) || (!isAgent && st !== 'cancelled')) throw err(403, 'You cannot set that status.');
  if (st === 'confirmed' && !req.body.force) {   // clash warning: another confirmed visit within 1 hour
    const t = new Date(i.preferred_at).getTime(), lo = new Date(t - 36e5).toISOString(), hi = new Date(t + 36e5).toISOString();
    const { data: clash } = await db().from('inspections').select('id').eq('agent_id', i.agent_id).eq('status', 'confirmed').neq('id', i.id).gte('preferred_at', lo).lte('preferred_at', hi);
    if (clash?.length) throw Object.assign(err(409, 'You already have a confirmed inspection within an hour of this time.'), { clash: true });
  }
  await db().from('inspections').update({ status: st }).eq('id', i.id);
  await notify(isAgent ? i.seeker_id : i.agent_id, 'inspection', `Inspection ${st.replace('_', ' ')}`); res.json({ ok: true });
}));
// ---- report a listing (3 different reporters auto-hide it until an admin reviews) ----
r.post('/reports', rateLimit(10, 3600000), requireAuth, wrap(async (req, res) => {
  const reason = req.body?.reason; if (!['scam', 'wrong_price', 'already_sold', 'wrong_photos', 'other'].includes(reason)) throw err(400, 'Choose a reason.');
  const pid = needUuid(req.body.property_id);
  const { error } = await db().from('reports').upsert({ property_id: pid, reporter_id: req.user.id, reason, details: text(req.body.details, 500) }, { onConflict: 'property_id,reporter_id' });
  if (error) throw error;
  const { count } = await db().from('reports').select('id', { count: 'exact', head: true }).eq('property_id', pid).eq('status', 'open');
  if (count >= 3) await db().from('properties').update({ auto_hidden: true }).eq('id', pid);
  res.status(201).json({ ok: true });
}));
r.get('/notifications', requireAuth, wrap(async (req, res) => {
  const { data } = await db().from('notifications').select('*').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(30); res.json({ items: data });
}));
module.exports = r;
