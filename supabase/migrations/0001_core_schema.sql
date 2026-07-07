-- Migration 0001: core schema
-- Phase 1 (design doc): sessions -> items, guest ownership via owner_token,
-- profiles as a thin extension of auth.users.

-- Required for gen_random_uuid()
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- profiles
-- Thin extension of Supabase's auth.users, for app-specific fields only.
-- ---------------------------------------------------------------------
create table profiles (
  id                    uuid primary key references auth.users(id) on delete cascade,
  display_name          text,
  plan                  text not null default 'free',
  storage_used_bytes    bigint not null default 0,
  created_at            timestamptz not null default now()
);

-- Auto-create a profile row whenever a new auth user signs up.
create function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ---------------------------------------------------------------------
-- sessions
-- The "upload session" / package container. One session = one shareable
-- link, can hold many items (mixed text + files).
-- ---------------------------------------------------------------------
create table sessions (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid references profiles(id) on delete cascade,
  owner_token_hash  text,                       -- null for authenticated sessions
  title             text,
  visibility        text not null default 'private'
                      check (visibility in ('private', 'unlisted', 'public')),
  password_hash     text,
  expires_at        timestamptz,
  created_at        timestamptz not null default now(),
  deleted_at        timestamptz,

  -- a session must be owned by either a profile OR a guest token, never neither
  constraint sessions_owner_or_guest check (
    owner_id is not null or owner_token_hash is not null
  )
);

create index sessions_owner_dashboard_idx
  on sessions (owner_id, deleted_at, created_at desc);

create index sessions_expiry_idx
  on sessions (expires_at)
  where deleted_at is null;

-- ---------------------------------------------------------------------
-- items
-- An individual piece of content (text snippet or file) inside a session.
-- ---------------------------------------------------------------------
create table items (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid not null references sessions(id) on delete cascade,
  kind                text not null check (kind in ('text', 'file')),
  title               text,
  order_index         int not null default 0,

  -- text-specific
  text_content        text,
  text_language       text,

  -- file-specific
  storage_key         text,
  mime_type           text,
  size_bytes          bigint,
  original_filename   text,

  status              text not null default 'pending'
                        check (status in ('pending', 'scanning', 'ready', 'rejected')),
  download_count      int not null default 0,
  one_time            boolean not null default false,

  created_at          timestamptz not null default now(),
  deleted_at          timestamptz,

  -- a text item has text_content, a file item has a storage_key -- never both, never neither
  constraint items_kind_matches_payload check (
    (kind = 'text' and text_content is not null and storage_key is null)
    or
    (kind = 'file' and storage_key is not null and text_content is null)
  )
);

create index items_session_order_idx
  on items (session_id, order_index);

create index items_search_idx
  on items using gin (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(text_content, '')));

-- ---------------------------------------------------------------------
-- access_events
-- Lightweight log: powers "recently viewed" / analytics later, and doubles
-- as abuse-detection forensics (see Phase 3 rate-limiting notes).
-- ---------------------------------------------------------------------
create table access_events (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references items(id) on delete cascade,
  event_type  text not null check (event_type in ('view', 'download')),
  ip_hash     text,
  created_at  timestamptz not null default now()
);

create index access_events_item_idx
  on access_events (item_id, created_at desc);
