-- Migration 0007: sharing a session with specific people by email.
--
-- Design decisions (agreed before writing any code):
--   - Sharing only works between two authenticated accounts. A guest
--     session has no durable identity to build an ACL on top of, and the
--     recipient MUST already have an account -- no pending-invite-by-email
--     yet (a real feature, deliberately deferred as its own thing rather
--     than folded into this one).
--   - Enumeration safety matters: nothing about this schema or the
--     policies below should let someone determine whether an email has an
--     account just by trying to share with it. That's enforced in the API
--     layer (the endpoint always responds identically either way), but
--     worth stating here too since it's why profiles.email exists at all
--     -- a lookup path that's only ever used server-side via service-role,
--     never exposed as a client-facing search/autocomplete.
--   - New, small, ADDITIVE policies rather than editing the existing
--     tested "owner can select own sessions" / items visibility policies.
--     Permissive RLS policies OR together automatically, so a separate
--     policy achieves the same effect without touching something already
--     verified working -- less risk than editing a policy that's been
--     carrying real traffic since Milestone 1.

-- ---------------------------------------------------------------------
-- profiles.email: needed to look someone up by email server-side.
-- Nullable (not backfillable with certainty for any pre-existing edge
-- cases) and unique when present -- mirrors auth.users' own uniqueness.
-- ---------------------------------------------------------------------
alter table profiles add column if not exists email text;
create unique index if not exists profiles_email_unique_idx on profiles (email) where email is not null;

-- Keep it populated going forward.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

-- Backfill existing profiles missing it.
update profiles p
set email = u.email
from auth.users u
where u.id = p.id and p.email is null;

-- ---------------------------------------------------------------------
-- session_shares
-- ---------------------------------------------------------------------
create table session_shares (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  shared_with_user_id uuid not null references profiles(id) on delete cascade,
  granted_by uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),

  unique (session_id, shared_with_user_id)
);

create index session_shares_shared_with_idx on session_shares (shared_with_user_id);
create index session_shares_session_idx on session_shares (session_id);

alter table session_shares enable row level security;

-- A user can see share rows either as the recipient (so they can see
-- what's shared with them) or, via the session, as the owner (so they can
-- manage who they've shared with). Two separate USING branches rather
-- than a join-based single one, for readability.
create policy "recipient can see their own share rows"
  on session_shares for select
  using (shared_with_user_id = auth.uid());

create policy "owner can see shares on their own sessions"
  on session_shares for select
  using (
    exists (
      select 1 from sessions s
      where s.id = session_shares.session_id and s.owner_id = auth.uid()
    )
  );

create policy "owner can create shares on their own sessions"
  on session_shares for insert
  with check (
    exists (
      select 1 from sessions s
      where s.id = session_shares.session_id and s.owner_id = auth.uid()
    )
  );

create policy "owner can revoke shares on their own sessions"
  on session_shares for delete
  using (
    exists (
      select 1 from sessions s
      where s.id = session_shares.session_id and s.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------
-- Additive visibility: a session/its items become visible to whoever
-- it's been shared with, layered on top of (not replacing) the existing
-- owner/public/unlisted policies from Phase 3.
-- ---------------------------------------------------------------------
create policy "shared-with user can select the session"
  on sessions for select
  using (
    deleted_at is null
    and exists (
      select 1 from session_shares ss
      where ss.session_id = sessions.id and ss.shared_with_user_id = auth.uid()
    )
  );

create policy "shared-with user can select ready items"
  on items for select
  using (
    deleted_at is null
    and status = 'ready'
    and exists (
      select 1 from session_shares ss
      join sessions s on s.id = ss.session_id
      where ss.session_id = items.session_id
        and ss.shared_with_user_id = auth.uid()
        and s.deleted_at is null
    )
  );
