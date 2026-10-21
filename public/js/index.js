AuroraReady.then(async () => {
  document.getElementById('fraud').textContent = FRAUD;
  AuroraAPI.get('/locations').then(d => { const s = document.getElementById('h-state'); d.states.forEach(n => s.add(new Option(n, n))); }).catch(() => {});
  document.getElementById('near').addEventListener('click', () => {
    if (!navigator.geolocation) return toast('Location is not available on this device.', 'error');
    navigator.geolocation.getCurrentPosition(p => location.href = `search.html?near=${p.coords.latitude.toFixed(4)},${p.coords.longitude.toFixed(4)}`, () => toast('Please allow location access to see nearby properties.', 'error'));
  });
  const box = document.getElementById('featured'); skeletons(box);
  try { const d = await AuroraAPI.get('/properties?verified=1'); box.innerHTML = d.items.length ? d.items.slice(0, 8).map(p => cardHTML(p)).join('') : '<p class="muted">No listings yet. Be the first to list a property.</p>'; wireHearts(box); }
  catch (e) { box.innerHTML = `<p class="muted">${escapeHtml(e.message)}</p>`; }
});
