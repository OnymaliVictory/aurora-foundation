const r = require('express').Router(); const { db } = require('../lib/db'); const { saveImage } = require('../lib/upload');
const { wrap, rateLimit, requireAuth, needUuid, err, text, notify } = require('../lib/mw');
const RESERVED = ['www', 'admin', 'api', 'app', 'aurora', 'estates', 'support', 'help', 'mail', 'static', 'assets', 'login', 'auth', 'blog', 'status', 'dashboard', 'search', 'agent', 'companies', 'company', 'terms', 'privacy', 'saved', 'property'];
const PUB = 'id,slug,name,tagline,about,logo_url,banner_url,brand_color,phone,email,whatsapp,address,state,website,socials,verified,created_at';
const membership = async uid => (await db().from('company_members').select('role, company:company_id(*)').eq('user_id', uid).maybeSingle()).data;
async function needAdmin(req) { const m = await membership(req.user.id); if (!m || !['owner', 'admin'].includes(m.role)) throw err(403, 'Only company admins can do that.'); return m; }
const slugOk = s => /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(s) && !RESERVED.includes(s);
function branding(b) {
  const o = {}, t = (k, n) => { if (b[k] !== undefined) o[k] = text(b[k], n); };
  t('name', 80); t('tagline', 140); t('about', 3000); t('phone', 20); t('email', 120); t('whatsapp', 20); t('address', 200); t('state', 40);
  if (o.phone) o.phone = o.phone.replace(/[^\d+]/g, ''); if (o.whatsapp) o.whatsapp = o.whatsapp.replace(/\D/g, '');
  if (o.name !== undefined && o.name.length < 2) throw err(400, 'Company name is too short.');
  if (b.website !== undefined) { o.website = text(b.website, 200); if (o.website && !/^https:\/\//.test(o.website)) throw err(400, 'Website must start with https://'); }
  if (b.brand_color !== undefined) { if (!/^#[0-9a-fA-F]{6}$/.test(b.brand_color)) throw err(400, 'Pick a valid brand colour.'); o.brand_color = b.brand_color; }
  if (b.socials && typeof b.socials === 'object') { o.socials = {}; for (const k of ['instagram', 'facebook', 'x', 'linkedin', 'youtube', 'tiktok']) if (b.socials[k]) { const v = text(b.socials[k], 200); if (!/^https:\/\//.test(v)) throw err(400, `${k} link must start with https://`); o.socials[k] = v; } }
  return o;
}
r.get('/', rateLimit(120), wrap(async (_q, res) => { const { data } = await db().from('companies').select(PUB).eq('status', 'active').order('verified', { ascending: false }).order('created_at', { ascending: false }).limit(60); res.json({ items: data }); }));
r.get('/check', rateLimit(60), wrap(async (req, res) => { const s = String(req.query.slug || '').toLowerCase();
  if (!slugOk(s)) return res.json({ available: false, reason: 'Use 3-30 letters, numbers or hyphens (not a reserved word).' });
  const { data } = await db().from('companies').select('id').eq('slug', s).maybeSingle(); res.json({ available: !data, reason: data ? 'That name is taken.' : '' }); }));
r.post('/', rateLimit(5, 3600000), requireAuth, wrap(async (req, res) => {
  if (await membership(req.user.id)) throw err(409, 'You already belong to a company.');
  const slug = String(req.body?.slug || '').toLowerCase(); if (!slugOk(slug)) throw err(400, 'Choose a valid company link name.');
  const o = branding({ ...req.body, socials: undefined }); if (!o.name) throw err(400, 'Company name is required.');
  const { data: c, error } = await db().from('companies').insert({ ...o, slug, owner_id: req.user.id }).select().single();
  if (error) throw error.code === '23505' ? err(409, 'That company link name is taken.') : error;
  await db().from('company_members').insert({ user_id: req.user.id, company_id: c.id, role: 'owner' });
  if (req.user.role === 'seeker') await db().from('profiles').update({ role: 'owner' }).eq('id', req.user.id);
  res.status(201).json({ company: c });
}));
r.post('/join', rateLimit(10, 3600000), requireAuth, wrap(async (req, res) => {
  if (await membership(req.user.id)) throw err(409, 'You already belong to a company.');
  const { data: c } = await db().from('companies').select('id,name,owner_id').eq('invite_code', text(req.body?.code, 20).toLowerCase()).maybeSingle(); if (!c) throw err(404, 'That invite code is not valid.');
  await db().from('company_members').insert({ user_id: req.user.id, company_id: c.id, role: 'agent' });
  if (req.user.role === 'seeker') await db().from('profiles').update({ role: 'agent' }).eq('id', req.user.id);
  await notify(c.owner_id, 'team', `${req.user.full_name || 'Someone'} joined ${c.name}`); res.json({ ok: true, company: c.name });
}));
r.get('/mine', requireAuth, wrap(async (req, res) => { const m = await membership(req.user.id); res.json({ membership: m ? { role: m.role, company: m.company } : null }); }));
r.patch('/mine', rateLimit(30), requireAuth, wrap(async (req, res) => { const m = await needAdmin(req); const o = branding(req.body || {}); if (!Object.keys(o).length) throw err(400, 'Nothing to update.');
  const { data, error } = await db().from('companies').update(o).eq('id', m.company.id).select().single(); if (error) throw error; res.json({ company: data }); }));
r.post('/mine/image', rateLimit(20, 600000), requireAuth, wrap(async (req, res) => { const m = await needAdmin(req); const kind = req.body?.kind;
  if (!['logo', 'banner'].includes(kind)) throw err(400, 'Invalid image type.'); const img = await saveImage('listing-images', 'company-' + m.company.id, req.body.data);
  await db().from('companies').update({ [kind + '_url']: img.url }).eq('id', m.company.id); res.json({ url: img.url }); }));
r.post('/mine/members/:uid/remove', requireAuth, wrap(async (req, res) => { const m = await needAdmin(req), uid = needUuid(req.params.uid); if (uid === m.company.owner_id) throw err(400, 'The owner cannot be removed.');
  await db().from('company_members').delete().eq('user_id', uid).eq('company_id', m.company.id); res.json({ ok: true }); }));
r.post('/mine/invite/reset', requireAuth, wrap(async (req, res) => { const m = await needAdmin(req); const code = require('crypto').randomBytes(5).toString('hex');
  await db().from('companies').update({ invite_code: code }).eq('id', m.company.id); res.json({ invite_code: code }); }));
// Monitoring dashboard: listings, team activity, leads, traffic. Company admins see counts and response speed, never private message text.
r.get('/mine/overview', rateLimit(60), requireAuth, wrap(async (req, res) => {
  const { company: co } = await needAdmin(req), since = new Date(Date.now() - 30 * 864e5).toISOString();
  const [{ data: mem }, { data: props }, { data: ev }] = await Promise.all([
    db().from('company_members').select('role, user:user_id(id,full_name,verified,phone)').eq('company_id', co.id),
    db().from('properties').select('id,title,status,views_count,owner_id,price,price_period,purpose,created_at,expires_at,reject_reason,auto_hidden').eq('company_id', co.id).neq('status', 'removed').order('created_at', { ascending: false }),
    db().from('site_events').select('kind,created_at').eq('company_id', co.id).gte('created_at', since)]);
  const ids = props.map(p => p.id);
  const enq = ids.length ? (await db().from('enquiries').select('id,property_id,agent_id,needs_reply,created_at,seeker:seeker_id(full_name),property:property_id(title)').in('property_id', ids).order('created_at', { ascending: false })).data : [];
  const insp = ids.length ? (await db().from('inspections').select('id,status,agent_id,property_id,preferred_at').in('property_id', ids)).data : [];
  const trend = Array.from({ length: 14 }, (_, k) => { const d = new Date(Date.now() - (13 - k) * 864e5).toISOString().slice(0, 10); return { day: d, views: ev.filter(e => e.kind === 'view' && e.created_at.startsWith(d)).length }; });
  const cnt = k => ev.filter(e => e.kind === k).length;
  res.json({ company: co, invite_code: co.invite_code,
    totals: { listings: props.length, active: props.filter(p => p.status === 'active').length, pending: props.filter(p => p.status === 'pending').length, rejected: props.filter(p => p.status === 'rejected').length, expiring_soon: props.filter(p => p.status === 'active' && new Date(p.expires_at) < new Date(Date.now() + 7 * 864e5)).length,
      enquiries: enq.length, unreplied: enq.filter(e => e.needs_reply).length, inspections_open: insp.filter(i => ['requested', 'confirmed'].includes(i.status)).length, inspections_done: insp.filter(i => i.status === 'completed').length,
      page_views_30d: cnt('view'), calls_30d: cnt('call'), whatsapp_30d: cnt('whatsapp'), shares_30d: cnt('share'), listing_views: props.reduce((s, p) => s + (p.views_count || 0), 0) },
    trend, team: mem.map(m => ({ id: m.user.id, name: m.user.full_name, role: m.role, verified: m.user.verified, listings: props.filter(p => p.owner_id === m.user.id).length, active: props.filter(p => p.owner_id === m.user.id && p.status === 'active').length, enquiries: enq.filter(e => e.agent_id === m.user.id).length, unreplied: enq.filter(e => e.agent_id === m.user.id && e.needs_reply).length })),
    listings: props.map(p => ({ ...p, enquiries: enq.filter(e => e.property_id === p.id).length, owner: mem.find(m => m.user.id === p.owner_id)?.user.full_name })),
    leads: enq.slice(0, 50).map(e => ({ id: e.id, seeker: e.seeker?.full_name, property: e.property?.title, needs_reply: e.needs_reply, agent: mem.find(m => m.user.id === e.agent_id)?.user.full_name, created_at: e.created_at })) });
}));
// Public storefront
r.get('/:slug', rateLimit(120), wrap(async (req, res) => {
  const { data: c } = await db().from('companies').select(PUB + ',status').eq('slug', String(req.params.slug).toLowerCase()).maybeSingle(); if (!c || c.status !== 'active') throw err(404, 'This company page does not exist.');
  const [{ data: listings }, { data: team }] = await Promise.all([
    db().from('properties').select('*, property_images(url,is_cover), owner:owner_id(id,full_name,verified), company:company_id(slug,name,verified)').eq('company_id', c.id).eq('status', 'active').eq('auto_hidden', false).gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(60),
    db().from('company_members').select('role, user:user_id(id,full_name,verified,avatar_url)').eq('company_id', c.id)]);
  await db().from('site_events').insert({ company_id: c.id, kind: 'view' }); delete c.status;
  res.json({ company: c, listings, team: team.map(t => ({ id: t.user.id, name: t.user.full_name, verified: t.user.verified, role: t.role })) });
}));
r.post('/:slug/event', rateLimit(30), wrap(async (req, res) => { const k = req.body?.kind; if (!['call', 'whatsapp', 'share'].includes(k)) throw err(400, 'Invalid event.');
  const { data: c } = await db().from('companies').select('id').eq('slug', String(req.params.slug).toLowerCase()).eq('status', 'active').maybeSingle(); if (c) await db().from('site_events').insert({ company_id: c.id, kind: k }); res.json({ ok: true }); }));
module.exports = r;
