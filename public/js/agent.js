AuroraReady.then(async () => {
  const me = await AuroraAuth.requireAuth(); if (!me) return;
  if (!['agent', 'owner', 'admin'].includes(me.role)) { document.querySelector('.wrap').innerHTML = '<div class="glass-card pad"><h1 class="page-title">Agent area</h1><p>This area is for agents and owners. Create an account as an agent or owner to list properties.</p></div>'; return; }
  const $ = id => document.getElementById(id), tabs = ['listings', 'new', 'leads', 'insp', 'verify'];
  const show = t => { tabs.forEach(x => $(x).hidden = x !== t); document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t)); if (t === 'leads') leads(); if (t === 'insp') insp(); if (t === 'verify') verif(); };
  document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => show(b.dataset.t));
  $('vbanner').innerHTML = me.verified ? '<span class="badge ok">✔ Verified agent</span>' : '<div class="notice">Your account is not verified yet. New listings are limited to 3 and only go public once an admin verifies you. Open the Verification tab.</div>';
  // ---- listings ----
  async function listings() { const box = $('listings'); box.innerHTML = '<div class="skeleton"></div>';
    try { const d = await AuroraAPI.get('/properties?mine=1');
      box.innerHTML = d.items.length ? `<div class="glass-card pad" style="overflow-x:auto"><table class="table"><tr><th>Listing</th><th>Status</th><th>Views</th><th></th></tr>${d.items.map(p => `<tr><td><a href="property.html?id=${encodeURIComponent(p.id)}">${escapeHtml(p.title)}</a><br><span class="muted">${escapeHtml(priceText(p))}</span></td><td><span class="badge ${p.status === 'active' ? 'ok' : p.status === 'rejected' ? 'bad' : 'warn'}">${escapeHtml(LABELS.status[p.status])}</span>${p.reject_reason ? `<br><span class="muted">${escapeHtml(p.reject_reason)}</span>` : ''}</td><td>${p.views_count}</td>
        <td class="row">${p.status === 'active' ? `<button class="btn-secondary btn-sm" data-a="sold" data-id="${p.id}">Mark sold/rented</button><button class="btn-secondary btn-sm" data-a="renew" data-id="${p.id}">Renew</button>` : ''}${p.status === 'expired' ? `<button class="btn-secondary btn-sm" data-a="renew" data-id="${p.id}">Renew</button>` : ''}${p.status !== 'removed' ? `<button class="btn-secondary btn-sm" data-a="del" data-id="${p.id}">Remove</button>` : ''}</td></tr>`).join('')}</table></div>` : '<div class="glass-card pad center"><p class="muted">No listings yet.</p><button class="btn-primary" id="first">Create your first listing</button></div>';
      $('first')?.addEventListener('click', () => show('new'));
      box.querySelectorAll('[data-a]').forEach(b => b.onclick = async () => { const id = b.dataset.id; try {
        if (b.dataset.a === 'sold') await AuroraAPI.patch('/properties/' + id, { status: 'sold_rented' }); if (b.dataset.a === 'renew') await AuroraAPI.post(`/properties/${id}/renew`); if (b.dataset.a === 'del') { if (!confirm('Remove this listing?')) return; await AuroraAPI.del('/properties/' + id); }
        toast('Done'); listings(); } catch (e) { toast(e.message, 'error'); } });
    } catch (e) { box.innerHTML = escapeHtml(e.message); } }
  // ---- new listing ----
  const nf = $('nf'); Object.entries(LABELS.purpose).forEach(([k, v]) => nf.purpose.add(new Option(v, k))); Object.entries(LABELS.ptype).forEach(([k, v]) => nf.ptype.add(new Option(v, k)));
  $('feat').innerHTML = Object.entries(LABELS.feature).map(([k, v]) => `<label class="badge"><input type="checkbox" name="f" value="${k}"> ${escapeHtml(v)}</label>`).join('');
  $('docs').innerHTML = Object.entries(LABELS.doc).map(([k, v]) => `<label class="badge"><input type="checkbox" name="d" value="${k}"> ${escapeHtml(v)}</label>`).join('');
  (await AuroraAPI.get('/locations').catch(() => ({ states: [] }))).states.forEach(n => $('ns').add(new Option(n, n)));
  $('ns').onchange = async () => { $('nl').length = 1; if ($('ns').value) (await AuroraAPI.get('/locations?state=' + encodeURIComponent($('ns').value))).lgas.forEach(n => $('nl').add(new Option(n, n))); };
  async function compress(file, max = 1600, q = .78) { const b = await createImageBitmap(file), s = Math.min(1, max / Math.max(b.width, b.height)), c = document.createElement('canvas'); c.width = Math.round(b.width * s); c.height = Math.round(b.height * s); c.getContext('2d').drawImage(b, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', q); }
  nf.onsubmit = async e => { e.preventDefault(); const btn = $('nsave'), msg = $('nmsg'); btn.disabled = true; msg.textContent = 'Saving…';
    try { const fd = Object.fromEntries(new FormData(nf)); delete fd.f; delete fd.d; fd.furnished = nf.furnished.checked;
      fd.features = [...nf.querySelectorAll('[name=f]:checked')].map(x => x.value); fd.documents = [...nf.querySelectorAll('[name=d]:checked')].map(x => x.value);
      const { property } = await AuroraAPI.post('/properties', fd); const files = [...$('photos').files].slice(0, 12);
      for (let i = 0; i < files.length; i++) { msg.textContent = `Uploading photo ${i + 1} of ${files.length}…`; await AuroraAPI.post(`/properties/${property.id}/images`, { data: await compress(files[i]), is_cover: i === 0 }); }
      nf.reset(); msg.textContent = ''; toast('Submitted! An admin will review it shortly.'); show('listings'); listings();
    } catch (x) { msg.textContent = x.message; } finally { btn.disabled = false; } };
  // ---- leads ----
  async function leads() { const box = $('leadlist'); box.innerHTML = '<div class="skeleton"></div>';
    try { const d = await AuroraAPI.get('/enquiries'); box.innerHTML = d.items.length ? d.items.map(x => `<button class="glass-card pad row" style="width:100%;text-align:left" data-e="${x.id}"><span class="grow"><b>${escapeHtml(x.property?.title)}</b><br><span class="muted">${escapeHtml(x.agent_id === me.id ? x.seeker?.full_name : 'Agent: ' + x.agent?.full_name)} · ${timeAgo(x.last_message_at)}</span></span>${x.needs_reply && x.agent_id === me.id ? '<span class="badge warn">Needs reply</span>' : ''}</button>`).join('') : '<p class="muted">No enquiries yet. They will appear here.</p>';
      box.querySelectorAll('[data-e]').forEach(b => b.onclick = () => thread(b.dataset.e)); } catch (e) { box.innerHTML = escapeHtml(e.message); } }
  async function thread(id) { const t = $('thread'); t.hidden = false; const d = await AuroraAPI.get(`/enquiries/${id}/messages`);
    t.innerHTML = `${d.items.map(m => `<div class="msg ${m.sender_id === d.me ? 'me' : ''}">${escapeHtml(m.body)}<br><small>${timeAgo(m.created_at)}</small></div>`).join('')}<form class="row"><input class="form-input grow" placeholder="Write a reply" maxlength="2000" required><button class="btn-primary">Send</button></form>`;
    t.querySelector('form').onsubmit = async e => { e.preventDefault(); try { await AuroraAPI.post(`/enquiries/${id}/messages`, { body: e.target[0].value }); thread(id); leads(); } catch (x) { toast(x.message, 'error'); } }; t.scrollIntoView(); }
  // ---- inspections ----
  async function insp() { const box = $('insplist'); box.innerHTML = '<div class="skeleton"></div>';
    try { const d = await AuroraAPI.get('/inspections'); box.innerHTML = d.items.length ? `<div class="glass-card pad" style="overflow-x:auto"><table class="table">${d.items.map(i => `<tr><td>${new Date(i.preferred_at).toLocaleString()}<br><span class="muted">${escapeHtml(i.property?.title)} · ${escapeHtml(i.seeker?.full_name || '')}</span></td><td><span class="badge">${escapeHtml(i.status.replace('_', ' '))}</span></td><td class="row">${i.agent_id === d.me && i.status === 'requested' ? `<button class="btn-primary btn-sm" data-s="confirmed" data-i="${i.id}">Confirm</button>` : ''}${i.agent_id === d.me && i.status === 'confirmed' ? `<button class="btn-secondary btn-sm" data-s="completed" data-i="${i.id}">Completed</button><button class="btn-secondary btn-sm" data-s="no_show" data-i="${i.id}">No-show</button>` : ''}${['requested', 'confirmed'].includes(i.status) ? `<button class="btn-secondary btn-sm" data-s="cancelled" data-i="${i.id}">Cancel</button>` : ''}</td></tr>`).join('')}</table></div>` : '<p class="muted">No inspections yet.</p>';
      box.querySelectorAll('[data-s]').forEach(b => b.onclick = async () => { const body = { status: b.dataset.s }; try { try { await AuroraAPI.patch('/inspections/' + b.dataset.i, body); } catch (e) { if (e.data?.clash && confirm(e.message + ' Confirm anyway?')) await AuroraAPI.patch('/inspections/' + b.dataset.i, { ...body, force: true }); else if (!e.data?.clash) throw e; } insp(); } catch (e) { toast(e.message, 'error'); } }); } catch (e) { box.innerHTML = escapeHtml(e.message); } }
  // ---- verification ----
  async function verif() { const v = (await AuroraAPI.get('/auth/verification')).verification; $('vstatus').innerHTML = me.verified ? '<span class="badge ok">✔ You are verified</span>' : v ? `<span class="badge ${v.status === 'rejected' ? 'bad' : 'warn'}">Status: ${escapeHtml(v.status)}</span> ${escapeHtml(v.reason || '')}` : ''; }
  $('vf').onsubmit = async e => { e.preventDefault(); try { await AuroraAPI.post('/auth/verification', Object.fromEntries(new FormData(e.target))); const vf = $('vdoc').files[0]; if (vf) await AuroraAPI.post('/auth/verification-doc', { data: await readB64(vf) }); toast('Request sent. We will review it soon.'); verif(); } catch (x) { toast(x.message, 'error'); } };
  listings();
});
function readB64(f) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); }); }
