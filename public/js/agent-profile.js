AuroraReady.then(async () => {
  const id = new URLSearchParams(location.search).get('id'), root = document.getElementById('p'); let d;
  try { d = await AuroraAPI.get('/agents/' + encodeURIComponent(id)); } catch (e) { root.innerHTML = `<div class="glass-card pad"><p>${escapeHtml(e.message)}</p></div>`; return; }
  const a = d.agent, stars = n => '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n)); document.title = a.full_name + ' · Aurora Estates';
  root.innerHTML = `<div class="glass-card pad stack"><h1 class="page-title">${escapeHtml(a.full_name)} ${a.verified ? '<span class="badge ok">✔ Verified agent</span>' : '<span class="badge warn">Not yet verified</span>'}</h1>
    <p>${escapeHtml(a.bio || '')}</p><p class="muted">${d.average ? `<b>${stars(d.average)}</b> ${d.average} (${d.reviews.length} reviews)` : 'No reviews yet'}</p></div>
    <h2 class="section-label" style="margin:20px 0 10px">Listings</h2><div id="ls" class="grid">${d.listings.map(p => cardHTML(p)).join('') || '<p class="muted">No active listings.</p>'}</div>
    <h2 class="section-label" style="margin:20px 0 10px">Reviews</h2><div class="stack">${d.reviews.map(r => `<div class="glass-card pad"><b>${stars(r.rating)}</b> ${escapeHtml(r.reviewer)}<br>${escapeHtml(r.body || '')}</div>`).join('') || '<p class="muted">Be the first to review after you enquire or inspect.</p>'}</div>
    <form id="rv" class="glass-card pad stack" style="margin-top:16px"><h2 class="section-label">Leave a review</h2><select class="form-input" name="rating" aria-label="Rating"><option value="5">★★★★★ 5</option><option value="4">★★★★ 4</option><option value="3">★★★ 3</option><option value="2">★★ 2</option><option value="1">★ 1</option></select><textarea class="form-input" name="body" maxlength="600" placeholder="How was your experience?"></textarea><button class="btn-primary">Submit review</button></form>`;
  wireHearts(document.getElementById('ls'));
  document.getElementById('rv').onsubmit = async e => { e.preventDefault(); if (!(await AuroraAuth.requireAuth())) return; try { await AuroraAPI.post(`/agents/${id}/reviews`, { rating: +e.target.rating.value, body: e.target.body.value }); toast('Thanks for your review'); location.reload(); } catch (x) { toast(x.message, 'error'); } };
});
