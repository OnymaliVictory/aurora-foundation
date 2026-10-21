// Used ONLY for login / signup / logout. All data goes through the Express API.
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
