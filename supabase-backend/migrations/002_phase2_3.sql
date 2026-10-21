-- Aurora Estates Phase 2 + 3. Run AFTER 001. Safe to re-run.
alter table agent_verifications add column if not exists doc_path text;
alter table properties add column if not exists boosted_until timestamptz;   -- reserved: premium / boosted listings
create table if not exists teams (id uuid primary key default gen_random_uuid(), name text not null, manager_id uuid references profiles on delete set null, created_at timestamptz default now());
create table if not exists contacts (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references profiles on delete cascade,
  name text not null check (char_length(name) between 2 and 100), phone text, email text,
  ctype text not null default 'buyer' check (ctype in ('buyer','seller','renter','landlord','investor')),
  source text check (source in ('website','referral','open_house','phone','other')),
  budget_min numeric, budget_max numeric, preferred_areas text[] default '{}', tags text[] default '{}', notes text, next_follow_up date, created_at timestamptz default now());
create index if not exists contacts_owner on contacts (owner_id, next_follow_up);
create table if not exists deals (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references profiles on delete cascade,
  contact_id uuid references contacts on delete set null, property_id uuid references properties on delete set null,
  stage text not null default 'new_lead' check (stage in ('new_lead','contacted','inspection','negotiation','offer_agreement','documentation','closed_won','lost')),
  amount numeric, commission_estimate numeric, expected_close_date date, actual_close_date date, lost_reason text,
  stage_changed_at timestamptz default now(), created_at timestamptz default now());
create index if not exists deals_owner on deals (owner_id, stage);
create table if not exists activities (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references profiles on delete cascade,
  contact_id uuid references contacts on delete cascade, deal_id uuid references deals on delete cascade,
  type text not null, body text, created_at timestamptz default now());
create index if not exists activities_owner on activities (owner_id, created_at desc);
create table if not exists documents (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references profiles on delete cascade,
  deal_id uuid references deals on delete cascade, property_id uuid references properties on delete set null,
  name text not null, category text not null default 'other' check (category in ('contract','tenancy_agreement','receipt','survey','c_of_o_copy','id','other')),
  storage_path text not null, size_bytes int, mime_type text, version int not null default 1, parent_id uuid references documents on delete set null, created_at timestamptz default now());
create index if not exists documents_deal on documents (deal_id);
create table if not exists reviews (
  id uuid primary key default gen_random_uuid(), agent_id uuid not null references profiles on delete cascade, reviewer_id uuid not null references profiles on delete cascade,
  rating int not null check (rating between 1 and 5), body text check (char_length(body) <= 600), created_at timestamptz default now(), unique (agent_id, reviewer_id));
create table if not exists saved_searches (id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles on delete cascade, name text, params jsonb not null default '{}', alerts boolean not null default false, last_sent_at timestamptz default now(), created_at timestamptz default now());
create table if not exists push_subscriptions (id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles on delete cascade, endpoint text not null unique, keys jsonb, created_at timestamptz default now());
create table if not exists rental_applications (id uuid primary key default gen_random_uuid(), property_id uuid not null references properties on delete cascade, applicant_id uuid not null references profiles on delete cascade,
  details jsonb not null default '{}', status text not null default 'submitted' check (status in ('submitted','reviewing','accepted','declined')), created_at timestamptz default now());
create table if not exists support_tickets (id uuid primary key default gen_random_uuid(), user_id uuid references profiles on delete set null, subject text not null, body text not null, status text not null default 'open' check (status in ('open','closed')), created_at timestamptz default now());
do $$ declare t text; begin
  foreach t in array array['teams','contacts','deals','activities','documents','reviews','saved_searches','push_subscriptions','rental_applications','support_tickets'] loop
    execute format('alter table %I enable row level security', t); end loop; end $$;   -- no policies: server-only
