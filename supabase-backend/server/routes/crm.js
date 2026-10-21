const { Router } = require('express'); const { db } = require('../lib/db'); const { saveFile } = require('../lib/upload');
const { wrap, rateLimit, requireAuth, requireRole, needUuid, err, text, notify } = require('../lib/mw');
const crm = Router(), agents = Router(), misc = Router();
crm.use(rateLimit(150), requireAuth, requireRole('agent', 'owner', 'manager', 'admin'));
const STAGES = ['new_lead', 'contacted', 'inspection', 'negotiation', 'offer_agreement', 'documentation', 'closed_won', 'lost'];
const CATS = ['contract', 'tenancy_agreement', 'receipt', 'survey', 'c_of_o_copy', 'id', 'other'];
// Whose data may I READ? agent = mine, manager = my team, admin = everyone. WRITES are always owner-only.
async function scope(u) { if (u.role === 'admin') return null; if (u.role === 'manager' && u.team_id) { const { data } = await db().from('profiles').select('id').eq('team_id', u.team_id); return data.map(x => x.id); } return [u.id]; }
const rd = (q, ids) => ids ? q.in('owner_id', ids) : q;
async function mine(table, req) { const { data } = await db().from(table).select('*').eq('id', needUuid(req.params.id)).single(); if (!data || (data.owner_id !== req.user.id && req.user.role !== 'admin')) throw err(404, 'Not found.'); return data; }
const log = (owner, type, body, ids = {}) => db().from('activities').insert({ owner_id: owner, type, body, ...ids });
const num = (v, max = 1e12) => { if (v === '' || v == null) return null; const n = Number(v); if (!Number.isFinite(n) || n < 0 || n > max) throw err(400, 'Invalid number.'); return n; };
const list = v => (Array.isArray(v) ? v : String(v || '').split(',')).map(x => text(x, 40)).filter(Boolean).slice(0, 15);
const date = v => { if (!v) return null; if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw err(400, 'Invalid date.'); return v; };

// ---- contacts ----
function contactIn(b, create) {
  const o = {}; if (b.name !== undefined) o.name = text(b.name, 100); if (create && (!o.name || o.name.length < 2)) throw err(400, 'Please enter the contact name.');
  if (b.phone !== undefined) o.phone = text(b.phone, 20).replace(/[^\d+]/g, ''); if (b.email !== undefined) o.email = text(b.email, 120);
  if (b.ctype !== undefined) { if (!['buyer', 'seller', 'renter', 'landlord', 'investor'].includes(b.ctype)) throw err(400, 'Invalid contact type.'); o.ctype = b.ctype; }
  if (b.source !== undefined) { if (b.source && !['website', 'referral', 'open_house', 'phone', 'other'].includes(b.source)) throw err(400, 'Invalid source.'); o.source = b.source || null; }
  if (b.budget_min !== undefined) o.budget_min = num(b.budget_min); if (b.budget_max !== undefined) o.budget_max = num(b.budget_max);
  if (b.preferred_areas !== undefined) o.preferred_areas = list(b.preferred_areas); if (b.tags !== undefined) o.tags = list(b.tags);
  if (b.notes !== undefined) o.notes = text(b.notes, 2000); if (b.next_follow_up !== undefined) o.next_follow_up = date(b.next_follow_up); return o;
}
crm.get('/contacts', wrap(async (req, res) => { const ids = await scope(req.user); let q = rd(db().from('contacts').select('*'), ids);
  if (req.query.q) { const k = String(req.query.q).replace(/[^\w\s@.+-]/g, '').slice(0, 40); if (k) q = q.or(`name.ilike.%${k}%,phone.ilike.%${k}%,email.ilike.%${k}%`); }
  if (req.query.tag) q = q.contains('tags', [text(req.query.tag, 40)]);
  const { data } = await q.order('created_at', { ascending: false }).limit(300); res.json({ items: data }); }));
crm.get('/followups', wrap(async (req, res) => { const ids = await scope(req.user); const { data } = await rd(db().from('contacts').select('id,name,phone,next_follow_up,tags'), ids)
  .not('next_follow_up', 'is', null).lte('next_follow_up', new Date().toISOString().slice(0, 10)).order('next_follow_up'); res.json({ items: data }); }));
crm.post('/contacts', rateLimit(60), wrap(async (req, res) => { const { data, error } = await db().from('contacts').insert({ ...contactIn(req.body || {}, true), owner_id: req.user.id }).select().single(); if (error) throw error;
  await log(req.user.id, 'contact_created', `Added ${data.name}`, { contact_id: data.id }); res.status(201).json({ contact: data }); }));
crm.get('/contacts/:id', wrap(async (req, res) => { const ids = await scope(req.user); const { data: c } = await rd(db().from('contacts').select('*').eq('id', needUuid(req.params.id)), ids).maybeSingle(); if (!c) throw err(404, 'Not found.');
  const { data: timeline } = await db().from('activities').select('*').eq('contact_id', c.id).order('created_at', { ascending: false }).limit(100);
  const { data: deals } = await db().from('deals').select('id,stage,amount,property:property_id(title)').eq('contact_id', c.id); res.json({ contact: c, timeline, deals }); }));
crm.patch('/contacts/:id', wrap(async (req, res) => { const c = await mine('contacts', req); const o = contactIn(req.body || {}, false); if (!Object.keys(o).length) throw err(400, 'Nothing to update.');
  const { data, error } = await db().from('contacts').update(o).eq('id', c.id).select().single(); if (error) throw error; res.json({ contact: data }); }));
crm.delete('/contacts/:id', wrap(async (req, res) => { const c = await mine('contacts', req); await db().from('contacts').delete().eq('id', c.id); res.json({ ok: true }); }));
crm.post('/contacts/:id/notes', rateLimit(60), wrap(async (req, res) => { const c = await mine('contacts', req); const b = text(req.body?.body, 2000); if (!b) throw err(400, 'Write a note first.');
  const type = ['note', 'call', 'email', 'showing'].includes(req.body.type) ? req.body.type : 'note'; await log(req.user.id, type, b, { contact_id: c.id }); res.status(201).json({ ok: true }); }));

// ---- deals ----
crm.get('/deals', wrap(async (req, res) => { const ids = await scope(req.user);
  const { data } = await rd(db().from('deals').select('*, contact:contact_id(id,name), property:property_id(id,title), owner:owner_id(full_name)'), ids).order('created_at', { ascending: false }).limit(500); res.json({ items: data, stages: STAGES }); }));
crm.post('/deals', rateLimit(60), wrap(async (req, res) => { const b = req.body || {}; const stage = b.stage || 'new_lead'; if (!STAGES.includes(stage)) throw err(400, 'Invalid stage.');
  const { data, error } = await db().from('deals').insert({ owner_id: req.user.id, stage, contact_id: b.contact_id ? needUuid(b.contact_id) : null, property_id: b.property_id ? needUuid(b.property_id) : null,
    amount: num(b.amount), commission_estimate: num(b.commission_estimate), expected_close_date: date(b.expected_close_date) }).select().single(); if (error) throw error;
  await log(req.user.id, 'deal_created', 'Deal created', { deal_id: data.id, contact_id: data.contact_id }); res.status(201).json({ deal: data }); }));
crm.patch('/deals/:id', wrap(async (req, res) => { const d = await mine('deals', req), b = req.body || {}, o = {};
  if (b.stage !== undefined) { if (!STAGES.includes(b.stage)) throw err(400, 'Invalid stage.'); if (b.stage !== d.stage) { o.stage = b.stage; o.stage_changed_at = new Date().toISOString(); if (b.stage === 'closed_won') o.actual_close_date = new Date().toISOString().slice(0, 10); } }
  if (b.amount !== undefined) o.amount = num(b.amount); if (b.commission_estimate !== undefined) o.commission_estimate = num(b.commission_estimate);
  if (b.expected_close_date !== undefined) o.expected_close_date = date(b.expected_close_date); if (b.lost_reason !== undefined) o.lost_reason = text(b.lost_reason, 200);
  if (!Object.keys(o).length) return res.json({ deal: d });
  const { data, error } = await db().from('deals').update(o).eq('id', d.id).select().single(); if (error) throw error;
  if (o.stage) await log(req.user.id, 'stage_change', `Stage: ${d.stage} → ${o.stage}`, { deal_id: d.id, contact_id: d.contact_id }); res.json({ deal: data }); }));
crm.delete('/deals/:id', wrap(async (req, res) => { const d = await mine('deals', req); await db().from('deals').delete().eq('id', d.id); res.json({ ok: true }); }));
crm.get('/activities', wrap(async (req, res) => { const ids = await scope(req.user); const { data } = await rd(db().from('activities').select('*'), ids).order('created_at', { ascending: false }).limit(30); res.json({ items: data }); }));

// ---- documents (private bucket, signed URLs, versions) ----
crm.get('/documents', wrap(async (req, res) => { const ids = await scope(req.user); let q = rd(db().from('documents').select('id,name,category,version,parent_id,size_bytes,created_at,deal_id,property_id,owner_id'), ids);
  if (req.query.deal_id) q = q.eq('deal_id', needUuid(req.query.deal_id)); const { data } = await q.order('created_at', { ascending: false }).limit(300); res.json({ items: data }); }));
crm.post('/documents', rateLimit(30, 600000), wrap(async (req, res) => { const b = req.body || {}; if (!CATS.includes(b.category)) throw err(400, 'Choose a document category.');
  if (b.deal_id) { const { data: d } = await db().from('deals').select('owner_id').eq('id', needUuid(b.deal_id)).single(); if (!d || d.owner_id !== req.user.id) throw err(404, 'Deal not found.'); }
  const f = await saveFile('deal-documents', req.user.id, b.data);
  const { data, error } = await db().from('documents').insert({ owner_id: req.user.id, deal_id: b.deal_id || null, property_id: b.property_id ? needUuid(b.property_id) : null, name: text(b.name, 120) || 'Document', category: b.category, storage_path: f.path, size_bytes: f.size, mime_type: f.mime }).select().single(); if (error) throw error;
  await log(req.user.id, 'document_uploaded', `Uploaded ${data.name}`, { deal_id: data.deal_id }); res.status(201).json({ document: data }); }));
crm.post('/documents/:id/version', rateLimit(30, 600000), wrap(async (req, res) => { const d = await mine('documents', req); const f = await saveFile('deal-documents', req.user.id, req.body?.data);
  const { data: top } = await db().from('documents').select('version').or(`id.eq.${d.parent_id || d.id},parent_id.eq.${d.parent_id || d.id}`).order('version', { ascending: false }).limit(1);
  const { data, error } = await db().from('documents').insert({ owner_id: d.owner_id, deal_id: d.deal_id, property_id: d.property_id, name: text(req.body.name, 120) || d.name, category: d.category, storage_path: f.path, size_bytes: f.size, mime_type: f.mime, version: (top?.[0]?.version || d.version) + 1, parent_id: d.parent_id || d.id }).select().single();
  if (error) throw error; res.status(201).json({ document: data }); }));
crm.get('/documents/:id/url', rateLimit(60), wrap(async (req, res) => { const ids = await scope(req.user); const { data: d } = await rd(db().from('documents').select('storage_path').eq('id', needUuid(req.params.id)), ids).maybeSingle(); if (!d) throw err(404, 'Not found.');
  const { data } = await db().storage.from('deal-documents').createSignedUrl(d.storage_path, 90); res.json({ url: data.signedUrl }); }));   // link lives 90 seconds
crm.delete('/documents/:id', wrap(async (req, res) => { const d = await mine('documents', req); await db().storage.from('deal-documents').remove([d.storage_path]); await db().from('documents').delete().eq('id', d.id); res.json({ ok: true }); }));

// ---- reports ----
crm.get('/reports', wrap(async (req, res) => {
  const ids = await scope(req.user), since = new Date(Date.now() - 30 * 864e5).toISOString();
  const [{ data: deals }, { data: acts }, { data: contacts }, { data: props }, { data: profs }] = await Promise.all([
    rd(db().from('deals').select('stage,amount,commission_estimate,actual_close_date,owner_id,contact_id'), ids), rd(db().from('activities').select('type,owner_id').gte('created_at', since), ids),
    rd(db().from('contacts').select('id,source'), ids), rd(db().from('properties').select('id,title,views_count,status'), ids).neq('status', 'removed'), db().from('profiles').select('id,full_name') ]);
  const sum = (a, k) => a.reduce((s, x) => s + Number(x[k] || 0), 0), nm = id => profs.find(p => p.id === id)?.full_name || 'Agent';
  const stage = STAGES.map(s => { const d = deals.filter(x => x.stage === s); return { stage: s, count: d.length, value: sum(d, 'amount') }; });
  const owners = [...new Set(deals.map(d => d.owner_id))].map(o => ({ name: nm(o), value: sum(deals.filter(d => d.owner_id === o), 'amount'), actions30: acts.filter(a => a.owner_id === o).length }));
  const months = Array.from({ length: 6 }, (_, k) => { const d = new Date(); d.setMonth(d.getMonth() - (5 - k)); return d.toISOString().slice(0, 7); });
  const closing = months.map(m => { const c = deals.filter(d => d.stage === 'closed_won' && (d.actual_close_date || '').startsWith(m)); return { month: m, deals: c.length, commission: sum(c, 'commission_estimate') }; });
  const byType = Object.entries(acts.reduce((a, x) => ({ ...a, [x.type]: (a[x.type] || 0) + 1 }), {})).map(([type, count]) => ({ type, count }));
  const sources = ['website', 'referral', 'open_house', 'phone', 'other'].map(src => { const cs = contacts.filter(c => c.source === src), set = new Set(cs.map(c => c.id));
    return { source: src, leads: cs.length, won: new Set(deals.filter(d => d.stage === 'closed_won' && set.has(d.contact_id)).map(d => d.contact_id)).size }; });
  const pids = props.map(p => p.id); const { data: enq } = pids.length ? await db().from('enquiries').select('id,property_id,agent_id,created_at').in('property_id', pids) : { data: [] };
  const listings = props.map(p => ({ title: p.title, views: p.views_count, enquiries: enq.filter(e => e.property_id === p.id).length })).sort((a, b) => b.views - a.views).slice(0, 10);
  // lead response speed = minutes from enquiry to the agent's first reply
  let speed = []; if (enq.length) { const { data: msgs } = await db().from('enquiry_messages').select('enquiry_id,sender_id,created_at').in('enquiry_id', enq.map(e => e.id)).order('created_at');
    const by = {}; enq.forEach(e => { const m = msgs.find(x => x.enquiry_id === e.id && x.sender_id === e.agent_id); if (m) (by[e.agent_id] ||= []).push((new Date(m.created_at) - new Date(e.created_at)) / 6e4); });
    speed = Object.entries(by).map(([a, v]) => ({ name: nm(a), minutes: Math.round(v.sort((x, y) => x - y)[Math.floor(v.length / 2)]) })).sort((x, y) => x.minutes - y.minutes); }
  const { count: insDone } = await rd(db().from('inspections').select('id', { count: 'exact', head: true }).eq('status', 'completed'), null).in('agent_id', ids || (profs.map(p => p.id)));
  res.json({ stage, owners, closing, byType, sources, listings, speed, inspections_completed: insDone || 0, deals_won: deals.filter(d => d.stage === 'closed_won').length });
}));

// ---- public agent profile + reviews ----
agents.get('/:id', rateLimit(120), wrap(async (req, res) => {
  const id = needUuid(req.params.id); const { data: a } = await db().from('profiles').select('id,full_name,verified,bio,avatar_url,role,created_at').eq('id', id).single();
  if (!a || !['agent', 'owner', 'manager'].includes(a.role)) throw err(404, 'Agent not found.');
  const { data: listings } = await db().from('properties').select('*, property_images(url,is_cover), owner:owner_id(id,full_name,verified)').eq('owner_id', id).eq('status', 'active').eq('auto_hidden', false).limit(12);
  const { data: revs } = await db().from('reviews').select('rating,body,created_at,reviewer:reviewer_id(full_name)').eq('agent_id', id).order('created_at', { ascending: false }).limit(50);
  const avg = revs.length ? Math.round(revs.reduce((s, r) => s + r.rating, 0) / revs.length * 10) / 10 : null;
  res.json({ agent: a, listings, reviews: revs.map(r => ({ ...r, reviewer: (r.reviewer?.full_name || 'Anonymous').split(' ')[0] })), average: avg });
}));
agents.post('/:id/reviews', rateLimit(10, 3600000), requireAuth, wrap(async (req, res) => {
  const id = needUuid(req.params.id), rating = Number(req.body?.rating); if (id === req.user.id) throw err(400, 'You cannot review yourself.'); if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw err(400, 'Choose 1 to 5 stars.');
  const { data: e } = await db().from('enquiries').select('id').eq('agent_id', id).eq('seeker_id', req.user.id).limit(1); const { data: i } = await db().from('inspections').select('id').eq('agent_id', id).eq('seeker_id', req.user.id).eq('status', 'completed').limit(1);
  if (!e?.length && !i?.length) throw err(403, 'You can review an agent after you have enquired about or inspected one of their properties.');
  const { error } = await db().from('reviews').upsert({ agent_id: id, reviewer_id: req.user.id, rating, body: text(req.body.body, 600) }, { onConflict: 'agent_id,reviewer_id' }); if (error) throw error;
  await notify(id, 'review', `You received a ${rating}-star review`); res.status(201).json({ ok: true }); }));

// ---- saved searches + notifications read ----
misc.get('/saved-searches', requireAuth, wrap(async (req, res) => { const { data } = await db().from('saved_searches').select('id,name,params,alerts').eq('user_id', req.user.id); res.json({ items: data }); }));
misc.post('/saved-searches', rateLimit(20), requireAuth, wrap(async (req, res) => { const ok = ['purpose', 'ptype', 'state', 'lga', 'min', 'max', 'beds', 'q']; const params = {}; ok.forEach(k => { if (req.body?.params?.[k]) params[k] = text(req.body.params[k], 60); });
  const { count } = await db().from('saved_searches').select('id', { count: 'exact', head: true }).eq('user_id', req.user.id); if (count >= 20) throw err(400, 'You can save up to 20 searches.');
  await db().from('saved_searches').insert({ user_id: req.user.id, name: text(req.body.name, 60) || 'My search', params, alerts: req.body.alerts === true }); res.status(201).json({ ok: true }); }));
misc.delete('/saved-searches/:id', requireAuth, wrap(async (req, res) => { await db().from('saved_searches').delete().eq('id', needUuid(req.params.id)).eq('user_id', req.user.id); res.json({ ok: true }); }));
misc.post('/notifications/read', requireAuth, wrap(async (req, res) => { await db().from('notifications').update({ read: true }).eq('user_id', req.user.id); res.json({ ok: true }); }));
module.exports = { crm, agents, misc };
