// Proves the whole API loads and key protections work (no database needed).
const assert = require('assert'); const http = require('http');
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const app = require('../../../api/index.js');   // exactly what Vercel loads
const { sniff } = require('../lib/upload');
const srv = http.createServer(app).listen(0, async () => {
  const base = 'http://127.0.0.1:' + srv.address().port;
  const call = async (m, p, body) => { const r = await fetch(base + p, { method: m, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) }); return { s: r.status, j: await r.json().catch(() => ({})) }; };
  try {
    assert.strictEqual((await call('GET', '/api/health')).s, 200);
    assert.strictEqual((await call('POST', '/api/enquiries', {})).s, 401);
    assert.strictEqual((await call('POST', '/api/properties', {})).s, 401);
    assert.strictEqual((await call('GET', '/api/admin/overview')).s, 401);
    assert.strictEqual((await call('GET', '/api/auth/me')).s, 401);
    assert.strictEqual((await call('GET', '/api/nothing')).s, 404);
    const unconfigured = await call('GET', '/api/properties');
    assert.strictEqual(unconfigured.s, 503); assert.ok(!/SUPABASE|stack|at /.test(JSON.stringify(unconfigured.j)), 'errors must be masked');
    for (const u of ['/api/crm/contacts', '/api/crm/deals', '/api/crm/documents', '/api/crm/reports', '/api/saved-searches']) assert.strictEqual((await call('GET', u)).s, 401, u + ' must require login');
    assert.strictEqual((await call('POST', '/api/agents/00000000-0000-0000-0000-000000000000/reviews', {})).s, 401);
    assert.strictEqual((await call('GET', '/api/cron/expire')).s, 401);
    assert.strictEqual(sniff(Buffer.from('<?php echo 1; ?>-----')), null);                       // script disguised as image is rejected
    assert.ok(sniff(Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0, 0, 0, 0, 0, 0, 0, 0, 0])));          // real JPEG header accepted
    const mi = require('../routes/properties').moveIn({ purpose: 'rent', price: 2000000, agency_fee_pct: 10, legal_fee_pct: 10, caution_deposit: 200000, service_charge: 50000 });
    assert.strictEqual(mi, 2650000);                                                               // move-in cost maths
    console.log('ALL SMOKE TESTS PASSED');
  } catch (e) { console.error('FAIL:', e.message); process.exitCode = 1; } finally { srv.close(); }
});
