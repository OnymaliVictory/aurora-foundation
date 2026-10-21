AuroraReady.then(() => {
  const v = (f, k) => Number(f.elements[k].value) || 0, $ = id => document.getElementById(id), A = $('a'), M = $('m');
  const a = () => { const yr = v(A, 'inc') * 12 * v(A, 'pct') / 100; $('ao').innerHTML = `You can afford about <b>${naira(yr)}</b> per year (${naira(yr / 12)} per month).<br>Remember move-in costs (agency, legal, caution) can add 20–30% on top of the first year's rent.`; };
  const m = () => { const p = v(M, 'price') * (1 - v(M, 'dp') / 100), r = v(M, 'rate') / 1200, n = v(M, 'yrs') * 12, pay = r ? p * r / (1 - Math.pow(1 + r, -n)) : p / n; $('mo').innerHTML = `Loan: <b>${naira(p)}</b><br>Monthly payment: <b>${naira(pay)}</b><br>Total repaid: <b>${naira(pay * n)}</b> (interest ${naira(pay * n - p)})`; };
  A.oninput = a; M.oninput = m; A.onsubmit = M.onsubmit = e => e.preventDefault(); a(); m();
});
