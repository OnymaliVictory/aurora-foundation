AuroraReady.then(async () => {
  if (!(await AuroraAuth.requireAuth())) return; const f = document.getElementById('f'), sm = document.getElementById('slugmsg'); let t;
  const mine = await AuroraAPI.get('/companies/mine'); if (mine.membership) { location.replace('company-dashboard.html'); return; }
  f.name.addEventListener('input', () => { if (!f.slug.dataset.touched) { f.slug.value = f.name.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30); f.slug.dispatchEvent(new Event('input')); } });
  f.slug.addEventListener('input', () => { f.slug.dataset.touched = f.slug.value ? '1' : ''; clearTimeout(t); t = setTimeout(async () => { if (!f.slug.value) { sm.textContent = ''; return; } try { const d = await AuroraAPI.get('/companies/check?slug=' + encodeURIComponent(f.slug.value)); sm.textContent = d.available ? `✔ Available: ${f.slug.value}.aurora` : '✖ ' + d.reason; } catch { sm.textContent = ''; } }, 350); });
  f.onsubmit = async e => { e.preventDefault(); try { await AuroraAPI.post('/companies', Object.fromEntries(new FormData(f))); toast('Your company page is live!'); location.href = 'company-dashboard.html'; } catch (x) { document.getElementById('msg').textContent = x.message; } };
  document.getElementById('j').onsubmit = async e => { e.preventDefault(); try { const d = await AuroraAPI.post('/companies/join', { code: e.target.code.value }); toast('You joined ' + d.company); location.href = 'agent.html'; } catch (x) { toast(x.message, 'error'); } };
});
