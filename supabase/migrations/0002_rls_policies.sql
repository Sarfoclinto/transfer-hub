-- Migration 0002: Row Level Security
-- Phase 3 (design doc): RLS is the real security boundary. Guest ownership
-- (owner_token_hash) is deliberately NOT part of RLS -- there's no auth.uid()
-- for a guest, so guest writes are verified in application code against the
-- hash, then performed via the service-role client (see lib/supabase/service-role.ts).
-- RLS below covers every path that DOES have a Postgres-native identity:
-- the authenticated owner, and any anonymous/public viewer of a shared link.

alter table profiles enable row level security;
alter table sessions enable row level security;
alter table items enable row level security;
alter table access_events enable row level security;

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------
create policy "users can view their own profile"
  on profiles for select
  using (id = auth.uid());

create policy "users can update their own profile"
  on profiles for update
  using (id = auth.uid());

-- insert is handled by the handle_new_user() trigger (security definer),
-- not by a client-facing policy -- no direct client insert is expected.

-- ---------------------------------------------------------------------
-- sessions
-- ---------------------------------------------------------------------
create policy "owner can select own sessions"
  on sessions for select
  using (owner_id = auth.uid());

create policy "public or unlisted sessions are viewable if not expired"
  on sessions for select
  using (
    visibility in ('public', 'unlisted')
    and deleted_at is null
    and (expires_at is null or expires_at > now())
  );

create policy "anyone can create a session"
  on sessions for insert
  with check (true); -- guest vs authed size/type limits enforced in app logic, not RLS

create policy "owner can update own sessions"
  on sessions for update
  using (owner_id = auth.uid());

create policy "owner can delete own sessions"
  on sessions for delete
  using (owner_id = auth.uid());

-- ---------------------------------------------------------------------
-- items
-- Visibility inherits from the parent session; a 'ready' status is required
-- for anyone other than the owner (mid-scan / rejected files stay invisible
-- to viewers even if they somehow have the link).
-- ---------------------------------------------------------------------
create policy "items visible if parent session is visible"
  on items for select
  using (
    deleted_at is null
    and (
      status = 'ready'
      or exists (
        select 1 from sessions s
        where s.id = items.session_id and s.owner_id = auth.uid()
      )
    )
    and exists (
      select 1 from sessions s
      where s.id = items.session_id
        and (
          s.owner_id = auth.uid()
          or (s.visibility in ('public', 'unlisted') and s.deleted_at is null)
        )
    )
  );

create policy "anyone can insert items into an existing session"
  on items for insert
  with check (true); -- request-upload/confirm-upload routes validate ownership via owner_token or auth.uid()

create policy "owner can update own items"
  on items for update
  using (
    exists (
      select 1 from sessions s
      where s.id = items.session_id and s.owner_id = auth.uid()
    )
  );

create policy "owner can delete own items"
  on items for delete
  using (
    exists (
      select 1 from sessions s
      where s.id = items.session_id and s.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------
-- access_events
-- Write-only from the client's perspective in practice (writes go through
-- the service-role client so any viewer, including guests, can be logged).
-- Reads restricted to the owning session's authenticated owner.
-- ---------------------------------------------------------------------
create policy "owner can view own analytics"
  on access_events for select
  using (
    exists (
      select 1 from items i
      join sessions s on s.id = i.session_id
      where i.id = access_events.item_id and s.owner_id = auth.uid()
    )
  );
