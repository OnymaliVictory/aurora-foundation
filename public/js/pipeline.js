AuroraReady.then(async () => {
  const me = await workspace('pipeline.html'); if (!me) return; const $ = id => document.getElementById(id); let deals = [], stages = [];
  AuroraAPI.get('/crm/contacts').then(d => d.items.forEach(c => $('dc').add(new Option(c.name, c.id)))).catch(() => {}); AuroraAPI.get('/properties?mine=1').then(d => d.items.forEach(p => $('dp').add(new Option(p.title, p.id)))).catch(() => {});
  const lab = s => s.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
  async function load() { try { const d = await AuroraAPI.get('/crm/deals'); deals = d.items; stages = d.stages; draw(); } catch (e) { $('board').textContent = e.message; } }
  function draw() { const month = new Date().toISOString().slice(0, 7);
    $('stats').textContent = `Expected closings this month: ${deals.filter(d => d.expected_close_date?.startsWith(month) && !['closed_won', 'lost'].includes(d.stage)).length}`;
    $('board').innerHTML = stages.map(s => { const col = deals.filter(d => d.stage === s), tot = col.reduce((a, d) => a + Number(d.amount || 0), 0);
      return `<div class="glass-card pad" data-s="${s}" style="min-width:230px;flex:1"><b>${lab(s)}</b> <span class="muted">${col.length} · ${naira(tot)}</span><div class="stack" style="margin-top:8px;min-height:60px">${col.map(d => `<div draggable="true" data-d="${d.id}" class="pcard pad" style="cursor:grab"><div class="row"><b class="grow">${escapeHtml(d.contact?.name || 'No contact')}</b>${d.owner_id === me.id || me.role === 'admin' ? `<button class="btn-secondary btn-sm" data-x="${d.id}" aria-label="Delete deal">✕</button>` : ''}</div><div class="muted">${escapeHtml(d.property?.title || 'No property')}</div><div>${naira(d.amount)}</div><div class="muted">${escapeHtml(d.expected_close_date || '')} ${me.role !== 'agent' && d.owner?.full_name ? '· ' + escapeHtml(d.owner.full_name) : ''}</div></div>`).join('')}</div></div>`; }).join('');
    document.querySelectorAll('[data-d]').forEach(c => c.ondragstart = e => e.dataTransfer.setData('text/plain', c.dataset.d));
    document.querySelectorAll('[data-s]').forEach(col => { col.ondragover = e => e.preventDefault(); col.ondrop = async e => { e.preventDefault(); const id = e.dataTransfer.getData('text/plain'), d = deals.find(x => x.id === id); if (!d || d.stage === col.dataset.s) return;
      const old = d.stage; d.stage = col.dataset.s; draw(); try { await AuroraAPI.patch('/crm/deals/' + id, { stage: col.dataset.s }); } catch (x) { d.stage = old; draw(); toast(x.message, 'error'); } }; });
    document.querySelectorAll('[data-x]').forEach(b => b.onclick = async () => { if (!confirm('Delete this deal?')) return; try { await AuroraAPI.del('/crm/deals/' + b.dataset.x); load(); } catch (x) { toast(x.message, 'error'); } }); }
  $('nd').onsubmit = async e => { e.preventDefault(); const d = Object.fromEntries(new FormData(e.target)); Object.keys(d).forEach(k => d[k] === '' && delete d[k]); try { await AuroraAPI.post('/crm/deals', d); e.target.reset(); toast('Deal created'); load(); } catch (x) { toast(x.message, 'error'); } };
  load();
});
