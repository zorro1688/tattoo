-- InkFirst Supabase schema draft.
-- Use this as the reviewed source SQL before creating an official migration
-- with `supabase migration new` after the Supabase CLI is installed.

create extension if not exists pgcrypto;

create schema if not exists inkfirst_private;

create or replace function inkfirst_private.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  create type public.generation_status as enum ('queued', 'processing', 'succeeded', 'failed', 'mock');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.generation_asset_type as enum ('concept', 'linework', 'placement');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.billing_provider as enum ('creem', 'stripe', 'manual');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.billing_plan as enum ('free', 'creator-pack', 'pro-monthly', 'pro-yearly');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.anonymous_clients (
  id text primary key,
  free_credits_remaining integer not null default 3 check (free_credits_remaining >= 0),
  paid_credits_remaining integer not null default 0 check (paid_credits_remaining >= 0),
  high_resolution_downloads_unlocked boolean not null default false,
  merged_into_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  free_credits_remaining integer not null default 3 check (free_credits_remaining >= 0),
  paid_credits_remaining integer not null default 0 check (paid_credits_remaining >= 0),
  high_resolution_downloads_unlocked boolean not null default false,
  active_plan public.billing_plan not null default 'free',
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.generations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users(id) on delete cascade,
  anonymous_client_id text references public.anonymous_clients(id) on delete set null,
  provider_generation_id text,
  provider text not null,
  model text not null,
  status public.generation_status not null default 'queued',
  prompt text not null,
  placement_note text,
  input_idea text not null,
  input_style text not null,
  input_placement text not null,
  input_size text not null,
  input_complexity text not null,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint generations_has_one_owner check (
    owner_user_id is not null or anonymous_client_id is not null
  )
);

create table if not exists public.generation_assets (
  id uuid primary key default gen_random_uuid(),
  generation_id uuid not null references public.generations(id) on delete cascade,
  asset_type public.generation_asset_type not null,
  storage_bucket text not null default 'inkfirst-designs',
  storage_path text,
  source_url text,
  content_type text,
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  is_watermarked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint generation_assets_file_source check (
    storage_path is not null or source_url is not null
  ),
  unique (generation_id, asset_type, is_watermarked)
);

create table if not exists public.credit_events (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users(id) on delete cascade,
  anonymous_client_id text references public.anonymous_clients(id) on delete set null,
  source public.billing_provider not null default 'manual',
  external_event_id text,
  plan public.billing_plan not null default 'free',
  credits_delta integer not null,
  high_resolution_unlocked boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint credit_events_has_one_owner check (
    owner_user_id is not null or anonymous_client_id is not null
  ),
  constraint credit_events_external_event_unique unique (source, external_event_id)
);

create table if not exists public.billing_events (
  id text primary key,
  provider public.billing_provider not null,
  event_type text,
  owner_user_id uuid references auth.users(id) on delete set null,
  anonymous_client_id text references public.anonymous_clients(id) on delete set null,
  plan public.billing_plan,
  credits integer,
  processed_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists generations_owner_user_created_idx
  on public.generations(owner_user_id, created_at desc);

create index if not exists generations_anonymous_created_idx
  on public.generations(anonymous_client_id, created_at desc);

create index if not exists generation_assets_generation_idx
  on public.generation_assets(generation_id);

create index if not exists credit_events_owner_created_idx
  on public.credit_events(owner_user_id, created_at desc);

create index if not exists credit_events_anonymous_created_idx
  on public.credit_events(anonymous_client_id, created_at desc);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function inkfirst_private.set_updated_at();

drop trigger if exists anonymous_clients_set_updated_at on public.anonymous_clients;
create trigger anonymous_clients_set_updated_at
before update on public.anonymous_clients
for each row execute function inkfirst_private.set_updated_at();

drop trigger if exists user_entitlements_set_updated_at on public.user_entitlements;
create trigger user_entitlements_set_updated_at
before update on public.user_entitlements
for each row execute function inkfirst_private.set_updated_at();

drop trigger if exists generations_set_updated_at on public.generations;
create trigger generations_set_updated_at
before update on public.generations
for each row execute function inkfirst_private.set_updated_at();

drop trigger if exists generation_assets_set_updated_at on public.generation_assets;
create trigger generation_assets_set_updated_at
before update on public.generation_assets
for each row execute function inkfirst_private.set_updated_at();

alter table public.profiles enable row level security;
alter table public.anonymous_clients enable row level security;
alter table public.user_entitlements enable row level security;
alter table public.generations enable row level security;
alter table public.generation_assets enable row level security;
alter table public.credit_events enable row level security;
alter table public.billing_events enable row level security;

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
on public.profiles for select
to authenticated
using (id = auth.uid());

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "Users can read their own entitlements" on public.user_entitlements;
create policy "Users can read their own entitlements"
on public.user_entitlements for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can read their own generations" on public.generations;
create policy "Users can read their own generations"
on public.generations for select
to authenticated
using (owner_user_id = auth.uid());

drop policy if exists "Users can read assets for their own generations" on public.generation_assets;
create policy "Users can read assets for their own generations"
on public.generation_assets for select
to authenticated
using (
  exists (
    select 1
    from public.generations
    where generations.id = generation_assets.generation_id
      and generations.owner_user_id = auth.uid()
  )
);

drop policy if exists "Users can read their own credit events" on public.credit_events;
create policy "Users can read their own credit events"
on public.credit_events for select
to authenticated
using (owner_user_id = auth.uid());

-- Anonymous clients, billing events, inserts, and quota mutations should be
-- handled by trusted server code using the Supabase service role key.
-- RLS remains enabled so accidental client-side access is denied by default.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'inkfirst-designs',
  'inkfirst-designs',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can read their own design files" on storage.objects;
create policy "Users can read their own design files"
on storage.objects for select
to authenticated
using (
  bucket_id = 'inkfirst-designs'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can upload their own design files" on storage.objects;
create policy "Users can upload their own design files"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'inkfirst-designs'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can update their own design files" on storage.objects;
create policy "Users can update their own design files"
on storage.objects for update
to authenticated
using (
  bucket_id = 'inkfirst-designs'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'inkfirst-designs'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can delete their own design files" on storage.objects;
create policy "Users can delete their own design files"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'inkfirst-designs'
  and (storage.foldername(name))[1] = auth.uid()::text
);
