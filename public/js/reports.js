AuroraReady.then(async () => {
  const me = await workspace('reports.html'); if (!me) return; const box = document.getElementById('r');
  try { const d = await AuroraAPI.get('/crm/reports'), mx = a => Math.max(1, ...a), card = (t, h) => `<div class="glass-card pad"><h2 class="section-label">${t}</h2>${h || '<p class="muted">No data yet.</p>'}</div>`;
    box.innerHTML = [
      card('Pipeline value by stage', d.stage.map(s => bar(s.stage.replace(/_/g, ' '), s.value, mx(d.stage.map(x => x.value)), `${s.count} · ${naira(s.value)}`)).join('')),
      card('Closings, last 6 months', d.closing.map(c => bar(c.month, c.commission, mx(d.closing.map(x => x.commission)), `${c.deals} deals · ${naira(c.commission)}`)).join('')),
      card('Activity, last 30 days', d.byType.map(a => bar(a.type.replace(/_/g, ' '), a.count, mx(d.byType.map(x => x.count)))).join('')),
      card('Lead sources → closed deals', d.sources.map(s => bar(s.source.replace('_', ' '), s.won, mx(d.sources.map(x => x.leads)), `${s.won}/${s.leads} (${s.leads ? Math.round(s.won / s.leads * 100) : 0}%)`)).join('')),
      card('Top listings: views and enquiries', d.listings.map(l => bar(l.title, l.views, mx(d.listings.map(x => x.views)), `${l.views} views · ${l.enquiries} enquiries`)).join('')),
      card('Inspection to deal', `<p>Completed inspections: <b>${d.inspections_completed}</b><br>Deals won: <b>${d.deals_won}</b><br>Conversion: <b>${d.inspections_completed ? Math.round(d.deals_won / d.inspections_completed * 100) : 0}%</b></p>`),
      ...(['manager', 'admin'].includes(me.role) ? [card('Team: pipeline value & activity', d.owners.map(o => bar(o.name, o.value, mx(d.owners.map(x => x.value)), `${naira(o.value)} · ${o.actions30} actions`)).join('')), card('Lead response speed (median minutes to first reply)', d.speed.map(s => bar(s.name, s.minutes, mx(d.speed.map(x => x.minutes)), s.minutes + ' min')).join(''))] : [])
    ].join(''); } catch (e) { box.innerHTML = `<p class="muted">${escapeHtml(e.message)}</p>`; }
});
