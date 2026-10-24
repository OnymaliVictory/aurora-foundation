// Aurora Estates shared helpers (same structure as Aurora Marketplace's app.js)
const AuroraAPI = {
  async authHeader() { const { data: { session } } = await supabaseClient.auth.getSession(); return session ? { Authorization: 'Bearer ' + session.access_token } : {}; },
  async request(path, opts = {}) {
    const headers = { ...(await this.authHeader()) };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch('/api' + path, { method: opts.method || 'GET', headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined });
    let data = {}; try { data = await res.json(); } catch {}
    if (!res.ok) throw Object.assign(new Error(data.error || 'Something went wrong. Please try again.'), { status: res.status, data });
    return data;
  },
  get(p) { return this.request(p); }, post(p, b) { return this.request(p, { method: 'POST', body: b }); },
  patch(p, b) { return this.request(p, { method: 'PATCH', body: b }); }, del(p) { return this.request(p, { method: 'DELETE' }); },
};
const AuroraTheme = {
  key: 'aurora_estates_theme',
  get() { try { return localStorage.getItem(this.key) || 'light'; } catch { return 'light'; } },
  apply(t) {
    document.documentElement.setAttribute('data-theme', t); document.documentElement.style.colorScheme = t;
    const c = document.getElementById('aurora-app-css'); if (c) c.disabled = t !== 'light';
    try { localStorage.setItem(this.key, t); } catch {}
    document.querySelectorAll('.theme-toggle').forEach(b => { b.textContent = t === 'light' ? '🌙' : '☀️'; b.title = t === 'light' ? 'Switch to night mode' : 'Switch to day mode'; b.setAttribute('aria-label', b.title); });
  },
  toggle() { this.apply(this.get() === 'light' ? 'dark' : 'light'); },
};
const AuroraAuth = {
  _user: undefined,
  async refresh() {
    try { const { data: { session } } = await supabaseClient.auth.getSession(); if (!session) { this._user = null; return null; }
      this._user = (await AuroraAPI.get('/auth/me')).user; } catch { this._user = null; }
    return this._user;
  },
  getCached() { return this._user; },
  async requireAuth() { if (this._user === undefined) await this.refresh(); if (!this._user) { location.href = 'auth.html?next=' + encodeURIComponent(location.pathname.split('/').pop() + location.search); return null; } return this._user; },
  async logout() { try { await supabaseClient.auth.signOut(); } catch {} this._user = null; location.href = 'index.html'; },
};
const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = u => (/^https:\/\//.test(u || '') ? u : '');
const timeAgo = iso => { const m = Math.floor((Date.now() - new Date(iso)) / 6e4); return m < 1 ? 'just now' : m < 60 ? m + 'm ago' : m < 1440 ? Math.floor(m / 60) + 'h ago' : Math.floor(m / 1440) + 'd ago'; };
function toast(msg, type = 'ok') { const t = document.createElement('div'); t.className = 'toast ' + (type === 'error' ? 'error' : ''); t.setAttribute('role', 'status'); t.textContent = msg; document.getElementById('toasts').appendChild(t); setTimeout(() => t.remove(), 4500); }
const LABELS = {
  purpose: { sale: 'For Sale', rent: 'For Rent', shortlet: 'Short-let', offplan: 'Off-plan', land: 'Land for Sale' },
  ptype: { flat: 'Flat / apartment', mini_flat: 'Mini-flat / self-contain', room_parlour: 'Room & parlour', terrace: 'Terrace', semi_detached: 'Semi-detached', detached: 'Detached', duplex: 'Duplex', bungalow: 'Bungalow', penthouse: 'Penthouse', bq: "Boys' quarters (BQ)", office: 'Office', shop: 'Shop', warehouse: 'Warehouse', land_residential: 'Land (residential)', land_commercial: 'Land (commercial)', land_farm: 'Land (farm)', hotel: 'Hotel / guesthouse' },
  feature: { gated_estate: 'Gated estate', security: 'Security', cctv: 'CCTV', fence: 'Fence', borehole: 'Borehole', generator: 'Generator', prepaid_meter: 'Prepaid meter', transformer: 'Transformer', parking: 'Parking', bq: 'BQ', furnished: 'Furnished', serviced: 'Serviced', internet: 'Internet', good_road: 'Good road', swimming_pool: 'Swimming pool', gym: 'Gym', air_conditioning: 'Air conditioning' },
  doc: { c_of_o: 'Certificate of Occupancy (C of O)', governors_consent: "Governor's Consent", deed_of_assignment: 'Deed of Assignment', survey_plan: 'Survey plan', registered_title: 'Registered title', excision_gazette: 'Excision / Gazette', purchase_receipt: 'Receipt / purchase agreement', building_approval: 'Building approval / permit' },
  status: { draft: 'Draft', pending: 'Awaiting approval', active: 'Live', under_offer: 'Under offer', sold_rented: 'Sold / rented', expired: 'Expired', rejected: 'Rejected', removed: 'Removed' },
};
const naira = n => '₦' + Number(n || 0).toLocaleString('en-NG');
const PER = { year: ' / year', month: ' / month', night: ' / night', once: '' };
const priceText = p => naira(p.price) + (PER[p.price_period] || '');
const FRAUD = 'Never pay before you inspect the property and verify the documents. Aurora does not collect money for properties.';
function coverOf(p) { const imgs = p.property_images || []; return safeUrl((imgs.find(i => i.is_cover) || imgs[0] || {}).url); }
function cardHTML(p, saved) {
  const img = coverOf(p), v = p.owner && p.owner.verified;
  return `<a class="pcard" href="property.html?id=${encodeURIComponent(p.id)}">
    ${img ? `<img class="pimg" loading="lazy" src="${escapeHtml(img)}" alt="${escapeHtml(p.title)}">` : '<div class="pimg"></div>'}
    <button class="heart" data-fav="${escapeHtml(p.id)}" aria-label="Save property">${saved ? '♥' : '♡'}</button>
    <div class="pbody"><div class="pprice">${priceText(p)}</div><div style="font-weight:600">${escapeHtml(p.title)}</div>
    <div class="pmeta">${escapeHtml([p.area, p.lga, p.state].filter(Boolean).join(', '))}</div>
    <div class="pmeta">${p.bedrooms != null ? p.bedrooms + ' bed · ' : ''}${p.bathrooms != null ? p.bathrooms + ' bath · ' : ''}${escapeHtml(LABELS.purpose[p.purpose] || '')} ${v ? '<span class="badge ok">✔ Verified</span>' : ''}</div></div></a>`;
}
async function wireHearts(root, savedIds) {
  root.querySelectorAll('[data-fav]').forEach(b => b.addEventListener('click', async e => {
    e.preventDefault(); e.stopPropagation();
    if (!(await AuroraAuth.requireAuth())) return;
    const id = b.dataset.fav, on = b.textContent === '♥';
    try { await (on ? AuroraAPI.del('/favourites/' + id) : AuroraAPI.post('/favourites/' + id)); b.textContent = on ? '♡' : '♥'; toast(on ? 'Removed from saved' : 'Saved'); } catch (er) { toast(er.message, 'error'); }
  }));
}
function skeletons(el, n = 6) { el.innerHTML = Array(n).fill('<div class="skeleton"></div>').join(''); }
function mountChrome(active) {
  const u = AuroraAuth.getCached();
  const links = [['Buy', 'search.html?purpose=sale'], ['Rent', 'search.html?purpose=rent'], ['Short-let', 'search.html?purpose=shortlet'], ['Land', 'search.html?purpose=land'], ['Companies', 'companies.html']];
  const acct = !u ? '<a class="nav-link" href="auth.html">Sign in</a>'
    : `${['agent', 'owner', 'manager'].includes(u.role) ? '<a class="nav-link" href="' + (u.role === 'manager' ? 'crm.html' : 'agent.html') + '">Workspace</a>' : ''}<a class="nav-link" href="notifications.html">🔔</a>${u.role === 'admin' ? '<a class="nav-link" href="admin.html">Admin</a>' : ''}<a class="nav-link" href="#" id="logout-link">Log out</a>`;
  document.getElementById('chrome-nav').innerHTML = `<nav class="navbar" aria-label="Main"><a href="index.html" class="nav-logo">✦ AURORA<span class="brand-sub">ESTATES</span></a>
    <div class="nav-links">${links.map(l => `<a class="nav-link" href="${l[1]}">${l[0]}</a>`).join('')}${acct}<button class="theme-toggle btn-secondary btn-sm" type="button"></button></div></nav>
    <nav class="tabbar" aria-label="Quick links"><a href="index.html" class="${active === 'home' ? 'active' : ''}">🏠<br>Home</a><a href="search.html" class="${active === 'search' ? 'active' : ''}">🔎<br>Search</a>
    <a href="saved.html" class="${active === 'saved' ? 'active' : ''}">♡<br>Saved</a><a href="${u ? (['agent', 'owner'].includes(u.role) ? 'agent.html' : u.role === 'manager' ? 'crm.html' : u.role === 'admin' ? 'admin.html' : 'saved.html') : 'auth.html'}" class="${active === 'account' ? 'active' : ''}">👤<br>${u ? 'Account' : 'Sign in'}</a></nav>`;
  document.getElementById('chrome-footer').innerHTML = `<footer class="footer pad center muted" style="padding-bottom:90px"><p>© Aurora Estates · <a href="terms.html">Terms</a> · <a href="privacy.html">Privacy</a> · <a href="mailto:support@aurora-estates.example">Contact</a></p></footer>`;
  document.querySelector('.theme-toggle').addEventListener('click', () => AuroraTheme.toggle());
  document.getElementById('logout-link')?.addEventListener('click', e => { e.preventDefault(); AuroraAuth.logout(); });
  AuroraTheme.apply(AuroraTheme.get());
}
const AuroraReady = (async () => {
  if (document.readyState === 'loading') await new Promise(r => document.addEventListener('DOMContentLoaded', r));
  await AuroraAuth.refresh(); mountChrome(document.body.dataset.active || '');
})();

// Agent / manager workspace sub-menu (CRM, pipeline, documents, reports, calculators)
async function workspace(active) {
  const u = await AuroraAuth.requireAuth(); if (!u) return null;
  if (!['agent', 'owner', 'manager', 'admin'].includes(u.role)) { document.querySelector('.wrap').innerHTML = '<div class="glass-card pad"><p>This area is for agents and owners. Create an account as an agent or owner to use it.</p></div>'; return null; }
  const L = [['agent.html', 'Listings'], ['crm.html', 'CRM'], ['pipeline.html', 'Pipeline'], ['documents.html', 'Documents'], ['reports.html', 'Reports'], ['calculators.html', 'Calculators'], ['company-dashboard.html', 'Company']];
  document.querySelector('.wrap').insertAdjacentHTML('afterbegin', `<div class="tabs" role="navigation" aria-label="Workspace">${L.map(l => `<a class="btn-secondary btn-sm ${l[0] === active ? 'on' : ''}" href="${l[0]}">${l[1]}</a>`).join('')}</div>`);
  return u;
}
const bar = (label, v, max, note) => `<div style="margin:6px 0"><div class="row"><span class="grow">${escapeHtml(label)}</span><span class="muted">${escapeHtml(note ?? v)}</span></div><div style="height:8px;border-radius:8px;background:var(--input-bg)"><div style="height:8px;border-radius:8px;background:var(--grad);width:${max ? Math.round(v / max * 100) : 0}%"></div></div></div>`;
