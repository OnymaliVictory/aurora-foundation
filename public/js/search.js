AuroraReady.then(async () => {
  const f = document.getElementById('f'), box = document.getElementById('results'); let page = 1, pages = 1, items = [], map, layer, view = 'list';
  Object.entries(LABELS.purpose).forEach(([k, v]) => f.purpose.add(new Option(v, k))); Object.entries(LABELS.ptype).forEach(([k, v]) => f.ptype.add(new Option(v, k)));
  const qs = new URLSearchParams(location.search), near = (qs.get('near') || '').split(',').map(Number);
  const states = (await AuroraAPI.get('/locations').catch(() => ({ states: [] }))).states; states.forEach(n => f.state.add(new Option(n, n)));
  async function lgas() { f.lga.length = 1; if (!f.state.value) return; (await AuroraAPI.get('/locations?state=' + encodeURIComponent(f.state.value))).lgas.forEach(n => f.lga.add(new Option(n, n))); }
  for (const [k, v] of qs) if (f.elements[k]) { if (f.elements[k].type === 'checkbox') f.elements[k].checked = true; else f.elements[k].value = v; }
  await lgas(); if (qs.get('lga')) f.lga.value = qs.get('lga'); f.state.addEventListener('change', lgas);
  const dist = p => p.lat == null ? 1e9 : Math.hypot(p.lat - near[0], p.lng - near[1]);
  async function load() {
    skeletons(box); const p = new URLSearchParams(new FormData(f)); [...p].forEach(([k, v]) => v === '' && p.delete(k)); p.set('page', page);
    try {
      const d = await AuroraAPI.get('/properties?' + p); items = d.items; pages = d.pages || 1;
      if (near.length === 2 && !isNaN(near[0])) items.sort((a, b) => dist(a) - dist(b));
      document.getElementById('count').textContent = d.total + ' properties';
      box.innerHTML = items.length ? items.map(x => cardHTML(x)).join('') : '<p class="muted">No properties match. Try widening your budget or removing a filter.</p>'; wireHearts(box);
      document.getElementById('pg').textContent = `Page ${page} of ${pages}`; if (view === 'map') drawMap();
    } catch (e) { box.innerHTML = `<p class="muted">${escapeHtml(e.message)}</p>`; }
  }
  function leaflet() { return new Promise(res => { if (window.L) return res(); const c = document.createElement('link'); c.rel = 'stylesheet'; c.href = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css'; document.head.appendChild(c);
    const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js'; s.onload = res; document.head.appendChild(s); }); }
  async function drawMap() {
    await leaflet(); const el = document.getElementById('map'); if (!map) { map = L.map(el).setView([6.5, 3.4], 6); L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors' }).addTo(map); }
    if (layer) layer.remove(); layer = L.layerGroup().addTo(map); const pts = items.filter(p => p.lat != null && p.lng != null);
    pts.forEach(p => L.circleMarker([p.lat, p.lng], { radius: 10, color: '#6D3EF2', fillColor: '#8B5CF6', fillOpacity: .85 }).addTo(layer).bindPopup(`<a href="property.html?id=${encodeURIComponent(p.id)}">${escapeHtml(p.title)}<br>${escapeHtml(priceText(p))}</a>`));
    map.invalidateSize(); if (pts.length) map.fitBounds(pts.map(p => [p.lat, p.lng]), { maxZoom: 14, padding: [30, 30] }); else toast('No pins for these results yet.');
  }
  const show = v => { view = v; box.style.display = v === 'list' ? '' : 'none'; document.getElementById('map').style.display = v === 'map' ? '' : 'none'; if (v === 'map') drawMap(); };
  document.getElementById('v-list').onclick = () => show('list'); document.getElementById('v-map').onclick = () => show('map');
  f.addEventListener('submit', e => { e.preventDefault(); page = 1; history.replaceState(null, '', '?' + new URLSearchParams([...new FormData(f)].filter(x => x[1]))); load(); });
  document.getElementById('prev').onclick = () => { if (page > 1) { page--; load(); } }; document.getElementById('next').onclick = () => { if (page < pages) { page++; load(); } };
  load();
});
