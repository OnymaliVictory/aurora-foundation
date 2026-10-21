const r = require('express').Router(); const { db } = require('../lib/db'); const { wrap, rateLimit } = require('../lib/mw');
// GET /api/locations            -> all states
// GET /api/locations?state=Lagos -> LGAs of that state
r.get('/', rateLimit(120), wrap(async (req, res) => {
  const { data: states } = await db().from('locations').select('id,name').eq('kind', 'state').order('name');
  if (!req.query.state) return res.json({ states: states.map(s => s.name) });
  const st = states.find(s => s.name === String(req.query.state));
  if (!st) return res.json({ lgas: [] });
  const { data } = await db().from('locations').select('name').eq('kind', 'lga').eq('parent_id', st.id).order('name');
  res.json({ lgas: data.map(l => l.name) });
}));
module.exports = r;
