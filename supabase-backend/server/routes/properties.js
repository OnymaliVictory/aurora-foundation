const r = require('express').Router(); const { db } = require('../lib/db'); const { saveImage } = require('../lib/upload');
const { wrap, rateLimit, optionalAuth, requireAuth, requireRole, needUuid, err, text } = require('../lib/mw');
const PURPOSES = ['sale', 'rent', 'shortlet', 'offplan', 'land'];
const TYPES = ['flat', 'mini_flat', 'room_parlour', 'terrace', 'semi_detached', 'detached', 'duplex', 'bungalow', 'penthouse', 'bq', 'office', 'shop', 'warehouse', 'land_residential', 'land_commercial', 'land_farm', 'hotel'];
const PERIODS = ['year', 'month', 'night', 'once'];
const FEATURES = ['gated_estate', 'security', 'cctv', 'fence', 'borehole', 'generator', 'prepaid_meter', 'transformer', 'parking', 'bq', 'furnished', 'serviced', 'internet', 'good_road', 'swimming_pool', 'gym', 'air_conditioning'];
const DOCS = ['c_of_o', 'governors_consent', 'deed_of_assignment', 'survey_plan', 'registered_title', 'excision_gazette', 'purchase_receipt', 'building_approval'];
const SEL = '*, property_images(id,url,is_cover,position), owner:owner_id(id,full_name,verified,avatar_url), company:company_id(slug,name,verified)';
const PUBLIC_OK = p => p.status === 'active' && !p.auto_hidden && new Date(p.expires_at) > new Date();

// Validates and allow-lists every field. Anything not listed here is ignored.
function clean(b, create) {
  const o = {};
  const txt = (k, max) => { if (b[k] !== undefined) o[k] = text(b[k], max); };
  const num = (k, min, max) => { if (b[k] === undefined) return; if (b[k] === null || b[k] === '') { o[k] = null; return; }
    const v = Number(b[k]); if (!Number.isFinite(v) || v < min || v > max) throw err(400, `Invalid ${k.replace(/_/g, ' ')}.`); o[k] = v; };
  const oneOf = (k, list) => { if (b[k] !== undefined) { if (!list.includes(b[k])) throw err(400, `Invalid ${k.replace(/_/g, ' ')}.`); o[k] = b[k]; } };
  txt('title', 120); txt('description', 4000); txt('state', 40); txt('lga', 80); txt('area', 80); txt('street', 120); txt('landmarks', 300);
  txt('electricity', 120); txt('water', 120); txt('flood_note', 200); txt('video_url', 300);
  oneOf('purpose', PURPOSES); oneOf('ptype', TYPES); oneOf('price_period', PERIODS);
  num('price', 1, 1e12); num('bedrooms', 0, 50); num('bathrooms', 0, 50); num('size_sqm', 0, 1e7); num('plots_available', 0, 10000);
  num('agency_fee_pct', 0, 30); num('legal_fee_pct', 0, 30); num('caution_deposit', 0, 1e11); num('service_charge', 0, 1e11); num('lat', -90, 90); num('lng', -180, 180);
  if (b.furnished !== undefined) o.furnished = !!b.furnished;
  if (b.installment !== undefined) o.installment = !!b.installment;
  if (Array.isArray(b.features)) o.features = b.features.filter(f => FEATURES.includes(f));
  if (o.video_url && !/^https:\/\//.test(o.video_url)) throw err(400, 'Video link must start with https://');
  if (create) for (const k of ['title', 'purpose', 'ptype', 'price', 'state', 'lga']) if (!o[k]) throw err(400, `Please fill in: ${k.replace(/_/g, ' ')}.`);
  if (o.title && o.title.length < 5) throw err(400, 'Title is too short.');
  return o;
}
const moveIn = p => p.purpose === 'rent'
  ? Math.round(+p.price + p.price * (p.agency_fee_pct || 0) / 100 + p.price * (p.legal_fee_pct || 0) / 100 + +(p.caution_deposit || 0) + +(p.service_charge || 0)) : null;
const out = p => ({ ...p, move_in_total: moveIn(p) });
const like = s => String(s).replace(/[^\w\s-]/g, '').slice(0, 60);

// Search (public). ?mine=1 lists the logged-in owner's own listings in every status.
r.get('/', rateLimit(120), optionalAuth, wrap(async (req, res) => {
  const q = req.query, page = Math.max(1, parseInt(q.page) || 1), size = 12;
  let s = db().from('properties').select(q.verified === '1' ? SEL.replace('owner:owner_id(', 'owner:owner_id!inner(') : SEL, { count: 'exact' });
  if (q.mine === '1') { if (!req.user) throw err(401, 'Please log in.'); s = s.eq('owner_id', req.user.id); }
  else s = s.eq('status', 'active').eq('auto_hidden', false).gt('expires_at', new Date().toISOString());
  if (PURPOSES.includes(q.purpose)) s = s.eq('purpose', q.purpose);
  if (TYPES.includes(q.ptype)) s = s.eq('ptype', q.ptype);
  if (q.state) s = s.eq('state', text(q.state, 40));
  if (q.lga) s = s.eq('lga', text(q.lga, 80));
  if (q.min && +q.min >= 0) s = s.gte('price', +q.min);
  if (q.max && +q.max > 0) s = s.lte('price', +q.max);
  if (q.beds && +q.beds >= 0) s = s.gte('bedrooms', +q.beds);
  if (q.baths && +q.baths >= 0) s = s.gte('bathrooms', +q.baths);
  if (q.furnished === '1') s = s.eq('furnished', true);
  if (q.verified === '1') s = s.eq('owner.verified', true);
  if (q.feature && FEATURES.includes(q.feature)) s = s.contains('features', [q.feature]);
  if (q.q) { const k = like(q.q); if (k) s = s.or(`title.ilike.%${k}%,area.ilike.%${k}%,lga.ilike.%${k}%,landmarks.ilike.%${k}%`); }
  const order = { price_asc: ['price', true], price_desc: ['price', false] }[q.sort] || ['created_at', false];
  const { data, count, error } = await s.order(order[0], { ascending: order[1] }).range((page - 1) * size, page * size - 1);
  if (error) throw error;
  res.json({ items: data.map(out), total: count || 0, page, pages: Math.ceil((count || 0) / size) });
}));

r.get('/:id', rateLimit(120), optionalAuth, wrap(async (req, res) => {
  const { data: p } = await db().from('properties').select(SEL + ', property_documents(doc_type,state)').eq('id', needUuid(req.params.id)).single();
  const mine = req.user && (req.user.id === p?.owner_id || req.user.role === 'admin');
  if (!p || (!PUBLIC_OK(p) && !mine)) throw err(404, 'This property is no longer available.');
  if (!mine) await db().from('properties').update({ views_count: (p.views_count || 0) + 1 }).eq('id', p.id);
  res.json({ property: out(p) });
}));
// Phone numbers are released only to logged-in users (reduces scraping).
r.get('/:id/contact', rateLimit(20), requireAuth, wrap(async (req, res) => {
  const { data: p } = await db().from('properties').select('owner_id,status').eq('id', needUuid(req.params.id)).single();
  if (!p || p.status !== 'active') throw err(404, 'This property is no longer available.');
  const { data: o } = await db().from('profiles').select('phone,full_name').eq('id', p.owner_id).single();
  if (!o?.phone) throw err(404, 'The agent has not added a phone number yet. Please use Message instead.');
  res.json({ phone: o.phone, name: o.full_name, whatsapp: 'https://wa.me/' + o.phone.replace(/\D/g, '') });
}));

r.post('/', rateLimit(20), requireAuth, requireRole('agent', 'owner', 'admin'), wrap(async (req, res) => {
  const o = clean(req.body || {}, true);
  if (!req.user.verified && req.user.role !== 'admin') {
    const { count } = await db().from('properties').select('id', { count: 'exact', head: true }).eq('owner_id', req.user.id).neq('status', 'removed');
    if (count >= 3) throw err(403, 'Unverified accounts can have up to 3 listings. Please request verification in your dashboard.');
  }
  const { data: mem } = await db().from('company_members').select('company_id').eq('user_id', req.user.id).maybeSingle();
  const { data, error } = await db().from('properties').insert({ ...o, owner_id: req.user.id, company_id: mem?.company_id || null, status: req.body.draft ? 'draft' : 'pending' }).select().single();
  if (error) throw error;
  const docs = (Array.isArray(req.body.documents) ? req.body.documents : []).filter(d => DOCS.includes(d));
  if (docs.length) await db().from('property_documents').insert(docs.map(d => ({ property_id: data.id, doc_type: d })));
  res.status(201).json({ property: data });
}));

async function owned(req) {
  const { data: p } = await db().from('properties').select('*').eq('id', needUuid(req.params.id)).single();
  if (!p || (p.owner_id !== req.user.id && req.user.role !== 'admin')) {
    if (p?.company_id) { const { data: m } = await db().from('company_members').select('role').eq('user_id', req.user.id).eq('company_id', p.company_id).maybeSingle(); if (m && ['owner', 'admin'].includes(m.role)) return p; }   // company admins manage their company's listings
    throw err(404, 'Listing not found.');
  }
  return p;
}
r.patch('/:id', rateLimit(40), requireAuth, wrap(async (req, res) => {
  const p = await owned(req); const o = clean(req.body || {}, false);
  const st = req.body.status;   // owners may only move between these; admins approve/reject elsewhere
  if (st !== undefined) { if (!['draft', 'pending', 'under_offer', 'sold_rented'].includes(st)) throw err(400, 'You cannot set that status.'); o.status = st; }
  if (p.status === 'active' && !o.status && Object.keys(o).some(k => ['title', 'price', 'purpose', 'state', 'lga'].includes(k))) o.status = 'pending';  // material edits are re-checked
  if (!Object.keys(o).length) throw err(400, 'Nothing to update.');
  const { data, error } = await db().from('properties').update(o).eq('id', p.id).select().single();
  if (error) throw error; res.json({ property: data });
}));
r.post('/:id/renew', rateLimit(10), requireAuth, wrap(async (req, res) => {
  const p = await owned(req);
  if (!['active', 'expired'].includes(p.status)) throw err(400, 'Only active or expired listings can be renewed.');
  await db().from('properties').update({ status: 'active', expires_at: new Date(Date.now() + 60 * 864e5).toISOString() }).eq('id', p.id);
  res.json({ ok: true });
}));
r.delete('/:id', rateLimit(20), requireAuth, wrap(async (req, res) => {
  const p = await owned(req); await db().from('properties').update({ status: 'removed' }).eq('id', p.id); res.json({ ok: true });
}));

// Image upload (client compresses first). Body: { data: <base64>, is_cover }
r.post('/:id/images', rateLimit(40, 600000), requireAuth, wrap(async (req, res) => {
  const p = await owned(req);
  const { count } = await db().from('property_images').select('id', { count: 'exact', head: true }).eq('property_id', p.id);
  if (count >= 12) throw err(400, 'You can add up to 12 photos per listing.');
  const img = await saveImage('listing-images', p.owner_id, req.body?.data);
  const { data: dup } = await db().from('property_images').select('property_id, properties!inner(owner_id)').eq('sha256', img.sha).limit(5);
  if (dup?.some(d => d.properties.owner_id !== p.owner_id)) { await db().storage.from('listing-images').remove([img.path]); throw err(409, 'This photo is already used on another account. Please upload your own photos.'); }
  const { data, error } = await db().from('property_images').insert({ property_id: p.id, url: img.url, storage_path: img.path, sha256: img.sha, is_cover: !!req.body.is_cover || count === 0, position: count }).select().single();
  if (error) throw error; res.status(201).json({ image: data });
}));
module.exports = r; module.exports.moveIn = moveIn;
