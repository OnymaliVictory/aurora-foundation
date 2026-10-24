# Aurora Estates — Phases 1 + 2 + 3: START HERE

Plain steps, exact clicks. Do them in order.

## 1. Create the database (Supabase)
1. Go to supabase.com → **New project** (use a NEW project, not the Marketplace one). Wait until it says ready.
2. Left menu → **SQL Editor** → **New query**.
3. Open `supabase-backend/migrations/001_phase1.sql`, copy everything, paste, click **Run**. "Success" is expected. It is safe to run again.
   **Then do the same with `002_phase2_3.sql` and then `003_companies.sql`** (CRM, documents, reviews, teams, company pages).
4. Left menu → **Project Settings → API**. Copy three things: **Project URL**, **anon public** key, **service_role** key (keep this one secret).
5. **Authentication → Providers → Email**: for quick testing turn **Confirm email** OFF (turn it back ON before launch).

## 2. Put the keys in the project
- Open `public/js/supabase-config.js`: paste the Project URL and the **anon** key (these two are safe to be public).
- Copy `.env.example` to `.env` and fill `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (service_role key). Never commit `.env`.

## 3. Run it on your computer
```
npm install
set SUPABASE_URL=...   (Windows PowerShell: $env:SUPABASE_URL="..."; $env:SUPABASE_SERVICE_ROLE_KEY="...")
npm start
```
Open http://localhost:3000, click **Sign in → Create account**, choose "Real estate agent".
Then in Supabase SQL Editor run `supabase-backend/seed.sql` (makes you a verified agent + 12 sample listings).
Make yourself admin: `update profiles set role='admin' where id=(select id from auth.users where email='YOUR@EMAIL');`

## 4. Put it online (GitHub + Vercel)
```
git add .
git commit -m "Aurora Estates phase 1"
git push
```
(First time only: `git init -b main`, create an empty repo on github.com, `git remote add origin <repo-url>`.)
Vercel → **Add New → Project** → pick the repo → **Environment Variables**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_URL` (your vercel address), `CRON_SECRET` (any long random text), `RESEND_API_KEY` (later) → **Deploy**.
Then Supabase → **Authentication → URL Configuration**: Site URL = your Vercel address; add it plus `http://localhost:3000` to Redirect URLs.

## 4b. Set up a team (optional, for the manager role)
In Supabase SQL Editor (replace the emails):
```
insert into teams (name) values ('My Agency');
update profiles set role='manager', team_id=(select id from teams where name='My Agency') where id=(select id from auth.users where email='MANAGER@EMAIL');
update profiles set team_id=(select id from teams where name='My Agency') where id=(select id from auth.users where email='AGENT@EMAIL');
```
Managers can READ their team's contacts, deals, documents and reports (never edit them). The admin API also has `POST /api/admin/teams` and `POST /api/admin/users/:id/team` for later.

## 5. Test checklist (live)
- [ ] Home loads in light and dark (moon/sun button), at phone width too
- [ ] Register as agent → Dashboard → Verification tab → request verification
- [ ] Admin page: approve the verification, then approve a new listing
- [ ] Listing shows on Search (list + map) and on its own page with the move-in cost table
- [ ] Second account: save a property, send a message, request an inspection
- [ ] Agent: reply in Leads, confirm inspection (try two within one hour to see the clash warning)
- [ ] CRM: add a contact with a follow-up date today; it shows under “Today's follow-ups”; log a call
- [ ] Pipeline: create a deal, drag it across stages; Reports shows pipeline value
- [ ] Documents: upload a PDF, upload a new version, download (link expires in 90 seconds)
- [ ] Agent profile: open it from a property page; leave a review after sending an enquiry
- [ ] Verification: upload an ID photo; admin clicks “View ID”
- [ ] Report a listing from 3 different accounts → it auto-hides; admin Reports tab restores or removes it

## What was and was NOT tested
Tested: every JS file passes a syntax check; every file the server requires exists; the SQL was written to be re-runnable.
NOT tested (my build machine had no internet): `npm install`, starting the API, calling endpoints, the database, and the pages in a browser (no screenshots, no phone-width or CSP run). Expect a few small fixes: paste any error to me. `npm test` (in `supabase-backend/server/tests/smoke.js`) starts the whole API and checks login protection, error masking, image-type sniffing and the move-in maths. Run it first.

## Not built yet (be aware)
Email + push notifications and saved-search email ALERTS (saved searches are stored via the API, but nothing sends yet; needs Resend/web-push wiring), edit-listing screen (API supports PATCH; the dashboard only creates), duplicate listing, Nominatim address search, similar properties and recently viewed, boosted listings (column reserved), rental-application and support-ticket screens (tables exist), admin screens for teams/audit (API exists), a saved-searches page, video upload (link field only), and Playwright browser tests.

## Next best step
Run `npm test`, then the checklist above; send me anything that breaks and I will fix it before starting Phase 2.

## Company pages (new)
- Companies register at `company-register.html`, get a page at `/c/<name>` (shown as `<name>.aurora`), and manage everything at `company-dashboard.html`.
- Their agents join with the invite code; every listing an agent posts attaches to the company automatically.
- Admin → **Companies** tab: verify or suspend a company. A listing from a verified company can be approved even if the individual agent is not yet verified.
- `.aurora` is not a real internet address ending, so nobody can register `acme.aurora`. When you buy a domain (for example `aurora-estates.ng`), add `*.aurora-estates.ng` in Vercel → Domains and tell me; I will add the `acme.aurora-estates.ng` routing.
- Limitation: link previews (WhatsApp, Facebook) show the generic Aurora title, not each company's, because pages are static. A server-rendered version is the next upgrade.
