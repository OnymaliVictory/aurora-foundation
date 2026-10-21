-- Aurora Estates Phase 1. Safe to re-run.
create extension if not exists pgcrypto;

create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text, phone text, avatar_url text, bio text, team_id uuid,
  role text not null default 'seeker' check (role in ('seeker','agent','owner','admin','manager')),
  verified boolean not null default false, suspended boolean not null default false,
  created_at timestamptz not null default now());
create table if not exists agent_verifications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles on delete cascade,
  id_type text not null check (id_type in ('nin','drivers_licence','voters_card','intl_passport')),
  business_name text, cac_number text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reason text, reviewed_by uuid references profiles, created_at timestamptz not null default now(), reviewed_at timestamptz);
create table if not exists locations (
  id serial primary key, kind text not null check (kind in ('state','lga','area')), name text not null, parent_id int references locations(id));
create unique index if not exists locations_uq on locations(kind, name, coalesce(parent_id, 0));
create table if not exists properties (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references profiles on delete cascade,
  purpose text not null check (purpose in ('sale','rent','shortlet','offplan','land')),
  ptype text not null check (ptype in ('flat','mini_flat','room_parlour','terrace','semi_detached','detached','duplex','bungalow','penthouse','bq','office','shop','warehouse','land_residential','land_commercial','land_farm','hotel')),
  title text not null check (char_length(title) between 5 and 120), description text,
  price numeric(16,2) not null check (price > 0), price_period text not null default 'once' check (price_period in ('year','month','night','once')),
  state text not null, lga text not null, area text, street text, landmarks text, lat double precision, lng double precision,
  bedrooms int check (bedrooms between 0 and 50), bathrooms int check (bathrooms between 0 and 50), size_sqm numeric, plots_available int, installment boolean not null default false,
  furnished boolean not null default false, features text[] not null default '{}', electricity text, water text, flood_note text,
  agency_fee_pct numeric default 0 check (agency_fee_pct between 0 and 30), legal_fee_pct numeric default 0 check (legal_fee_pct between 0 and 30),
  caution_deposit numeric default 0, service_charge numeric default 0, video_url text,
  status text not null default 'pending' check (status in ('draft','pending','active','under_offer','sold_rented','expired','rejected','removed')),
  auto_hidden boolean not null default false, reject_reason text, views_count int not null default 0,
  expires_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index if not exists properties_search on properties (status, purpose, state, lga, price);
create index if not exists properties_owner on properties (owner_id);
create table if not exists property_images (
  id uuid primary key default gen_random_uuid(), property_id uuid not null references properties on delete cascade,
  url text not null, storage_path text, sha256 text, is_cover boolean not null default false, position int not null default 0, created_at timestamptz not null default now());
create index if not exists property_images_hash on property_images (sha256);
create table if not exists property_documents (
  id uuid primary key default gen_random_uuid(), property_id uuid not null references properties on delete cascade,
  doc_type text not null check (doc_type in ('c_of_o','governors_consent','deed_of_assignment','survey_plan','registered_title','excision_gazette','purchase_receipt','building_approval')),
  state text not null default 'declared' check (state in ('declared','verified')), verified_by uuid references profiles, verified_at timestamptz,
  unique (property_id, doc_type));
create table if not exists favourites (user_id uuid references profiles on delete cascade, property_id uuid references properties on delete cascade, created_at timestamptz default now(), primary key (user_id, property_id));
create table if not exists enquiries (
  id uuid primary key default gen_random_uuid(), property_id uuid not null references properties on delete cascade,
  seeker_id uuid not null references profiles on delete cascade, agent_id uuid not null references profiles on delete cascade,
  status text not null default 'open' check (status in ('open','closed')), needs_reply boolean not null default true,
  last_message_at timestamptz not null default now(), created_at timestamptz not null default now(), unique (property_id, seeker_id));
create table if not exists enquiry_messages (
  id uuid primary key default gen_random_uuid(), enquiry_id uuid not null references enquiries on delete cascade,
  sender_id uuid not null references profiles on delete cascade, body text not null check (char_length(body) between 1 and 2000), created_at timestamptz not null default now());
create table if not exists inspections (
  id uuid primary key default gen_random_uuid(), property_id uuid not null references properties on delete cascade,
  seeker_id uuid not null references profiles on delete cascade, agent_id uuid not null references profiles on delete cascade,
  preferred_at timestamptz not null, notes text, reminder_at timestamptz,
  status text not null default 'requested' check (status in ('requested','confirmed','completed','cancelled','no_show')), created_at timestamptz not null default now());
create index if not exists inspections_agent on inspections (agent_id, preferred_at);
create table if not exists reports (
  id uuid primary key default gen_random_uuid(), property_id uuid not null references properties on delete cascade,
  reporter_id uuid not null references profiles on delete cascade,
  reason text not null check (reason in ('scam','wrong_price','already_sold','wrong_photos','other')), details text,
  status text not null default 'open' check (status in ('open','dismissed','actioned')), created_at timestamptz not null default now(), unique (property_id, reporter_id));
create table if not exists notifications (id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles on delete cascade, kind text not null, body text not null, read boolean not null default false, created_at timestamptz not null default now());
create table if not exists audit_log (id uuid primary key default gen_random_uuid(), actor_id uuid references profiles, action text not null, target_type text, target_id text, meta jsonb default '{}', created_at timestamptz not null default now());

-- RLS on EVERY table, with NO public policies: the browser can never read/write data directly.
-- Only the Express API (service-role key) touches these tables.
do $$ declare t text; begin
  foreach t in array array['profiles','agent_verifications','locations','properties','property_images','property_documents','favourites','enquiries','enquiry_messages','inspections','reports','notifications','audit_log'] loop
    execute format('alter table %I enable row level security', t);
  end loop; end $$;

-- Triggers that must never be bypassed
create or replace function touch_updated() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists properties_touch on properties;
create trigger properties_touch before update on properties for each row execute function touch_updated();

create or replace function lock_property_owner() returns trigger language plpgsql as $$
begin if new.owner_id <> old.owner_id then raise exception 'owner cannot be changed'; end if; return new; end $$;
drop trigger if exists properties_lock_owner on properties;
create trigger properties_lock_owner before update on properties for each row execute function lock_property_owner();

-- Only the server (service role) may change role / verified / suspended
create or replace function protect_profile() returns trigger language plpgsql as $$
begin if coalesce(auth.role(), 'service_role') in ('anon','authenticated') then
  new.role := old.role; new.verified := old.verified; new.suspended := old.suspended; end if; return new; end $$;
drop trigger if exists profiles_protect on profiles;
create trigger profiles_protect before update on profiles for each row execute function protect_profile();

create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin insert into profiles (id, full_name) values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))) on conflict do nothing; return new; end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- Storage: public bucket for approved listing images; private bucket for verification docs (no policies = server-only, signed URLs)
insert into storage.buckets (id, name, public) values ('listing-images','listing-images',true) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('verification-docs','verification-docs',false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('deal-documents','deal-documents',false) on conflict (id) do nothing;

-- Locations: 36 states + FCT, plus major LGAs
insert into locations (kind, name) select 'state', s from unnest(array['Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno','Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','FCT (Abuja)','Gombe','Imo','Jigawa','Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara','Lagos','Nasarawa','Niger','Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto','Taraba','Yobe','Zamfara']) s
  where not exists (select 1 from locations l where l.kind = 'state' and l.name = s);

do $$ declare m jsonb := '{
 "Lagos":["Eti-Osa","Ikeja","Lagos Island","Lagos Mainland","Surulere","Alimosho","Ikorodu","Kosofe","Ajah","Ifako-Ijaiye"],
 "FCT (Abuja)":["Abuja Municipal","Gwagwalada","Bwari","Kuje","Kwali","Abaji"],
 "Rivers":["Port Harcourt","Obio-Akpor","Eleme","Ikwerre","Oyigbo","Okrika"],
 "Oyo":["Ibadan North","Ibadan South-West","Ogbomosho North","Egbeda","Akinyele"],
 "Kano":["Kano Municipal","Nassarawa","Fagge","Tarauni","Ungogo"],
 "Enugu":["Enugu North","Enugu South","Enugu East","Nsukka","Udi"],
 "Delta":["Warri South","Uvwie","Oshimili South","Sapele","Ethiope East"]}'; k text; l text; sid int; begin
  for k in select jsonb_object_keys(m) loop
    select id into sid from locations where kind = 'state' and name = k;
    for l in select jsonb_array_elements_text(m->k) loop
      insert into locations (kind, name, parent_id) select 'lga', l, sid where not exists (select 1 from locations where kind='lga' and name=l and parent_id=sid);
    end loop; end loop; end $$;
