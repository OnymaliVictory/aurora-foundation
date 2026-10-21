const { createClient } = require('@supabase/supabase-js');
let client;
// Service-role client: bypasses RLS, so it must ONLY ever be used on the server.
function db() {
  if (!client) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
      throw Object.assign(new Error('not configured'), { status: 503, public: 'The service is not configured yet.' });
    client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  }
  return client;
}
module.exports = { db };
