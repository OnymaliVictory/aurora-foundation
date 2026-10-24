-- Aurora Estates: company storefronts. Run AFTER 001 and 002. Safe to re-run.
create table if not exists companies (
  id uuid primary key default gen_random_uuid(), slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$'),
  name text not null check (char_length(name) between 2 and 80), tagline text, about text, logo_url text, banner_url text,
  brand_color text not null default '#6D3EF2' check (brand_color ~ '^#[0-9a-fA-F]{6}$'),
  phone text, email text, whatsapp text, address text, state text, website text, socials jsonb not null default '{}',
  status text not null default 'active' check (status in ('active','suspended')), verified boolean not null default false,
  invite_code text not null unique default encode(gen_random_bytes(5), 'hex'),
  owner_id uuid not null references profiles on delete cascade, created_at timestamptz not null default now());
create table if not exists company_members (
  user_id uuid primary key references profiles on delete cascade,   -- one company per person
  company_id uuid not null references companies on delete cascade,
  role text not null default 'agent' check (role in ('owner','admin','agent')), joined_at timestamptz not null default now());
create index if not exists company_members_company on company_members (company_id);
create table if not exists site_events (
  id bigserial primary key, company_id uuid not null references companies on delete cascade,
  kind text not null check (kind in ('view','call','whatsapp','share')), created_at timestamptz not null default now());
create index if not exists site_events_company on site_events (company_id, created_at desc);
alter table properties add column if not exists company_id uuid references companies on delete set null;
create index if not exists properties_company on properties (company_id, status);
alter table companies enable row level security; alter table company_members enable row level security; alter table site_events enable row level security;  -- server-only
