AuroraReady.then(() => {
  let up = false; const f = document.getElementById('f'), err = document.getElementById('err');
  const dest = u => { const n = new URLSearchParams(location.search).get('next'); if (n && /^[a-z0-9_-]+\.html(\?[\w=&%.,-]*)?$/i.test(n)) return n; return u?.role === 'admin' ? 'admin.html' : ['agent', 'owner'].includes(u?.role) ? 'agent.html' : 'index.html'; };
  const mode = m => { up = m; document.getElementById('up-only').hidden = !m; document.getElementById('go').textContent = m ? 'Create account' : 'Sign in'; document.getElementById('t-in').classList.toggle('on', !m); document.getElementById('t-up').classList.toggle('on', m); f.password.autocomplete = m ? 'new-password' : 'current-password'; };
  document.getElementById('t-in').onclick = () => mode(false); document.getElementById('t-up').onclick = () => mode(true); if (AuroraAuth.getCached()) location.replace(dest(AuroraAuth.getCached()));
  f.onsubmit = async e => { e.preventDefault(); err.textContent = ''; const d = Object.fromEntries(new FormData(f)), btn = document.getElementById('go'); btn.disabled = true;
    try {
      if (up) {
        const { data, error } = await supabaseClient.auth.signUp({ email: d.email, password: d.password, options: { data: { full_name: d.full_name }, emailRedirectTo: location.origin + '/auth.html' } });
        if (error) throw error;
        if (!data.session) { err.textContent = 'Account created. Please check your email to confirm, then sign in.'; sessionStorage.setItem('aurora_pending', JSON.stringify({ role: d.role, phone: d.phone, full_name: d.full_name })); mode(false); return; }
        await AuroraAuth.refresh(); if (d.role !== 'seeker' || d.phone) await AuroraAPI.patch('/auth/me', { role: d.role, phone: d.phone, full_name: d.full_name });
      } else {
        const { error } = await supabaseClient.auth.signInWithPassword({ email: d.email, password: d.password }); if (error) throw error;
        const pending = JSON.parse(sessionStorage.getItem('aurora_pending') || 'null'); await AuroraAuth.refresh();
        if (pending) { await AuroraAPI.patch('/auth/me', pending).catch(() => {}); sessionStorage.removeItem('aurora_pending'); }
      }
      location.href = dest(await AuroraAuth.refresh());
    } catch (x) { err.textContent = /invalid login/i.test(x.message) ? 'Email or password is not correct.' : x.message; } finally { btn.disabled = false; } };
  document.getElementById('google').onclick = async () => { const { error } = await supabaseClient.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + '/auth.html' } }); if (error) err.textContent = error.message; };
  document.getElementById('forgot').onclick = async () => { const email = f.email.value; if (!email) { err.textContent = 'Type your email above first.'; return; }
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/auth.html' }); err.textContent = error ? error.message : 'Check your email for a reset link.'; };
});
