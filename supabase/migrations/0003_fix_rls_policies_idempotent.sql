-- supabase/migrations/0003_fix_rls_policies_idempotent.sql
-- Safe to run any number of times: drops each policy if present, then recreates it.
-- Use this if RLS ever behaves unexpectedly and you're not sure what state it's in.

drop policy if exists "users can view their own profile" on profiles;
create policy "users can view their own profile" on profiles for select using (id = auth.uid());

drop policy if exists "users can update their own profile" on profiles;
create policy "users can update their own profile" on profiles for update using (id = auth.uid());

drop policy if exists "owner can select own sessions" on sessions;
create policy "owner can select own sessions" on sessions for select using (owner_id = auth.uid());

drop policy if exists "public or unlisted sessions are viewable if not expired" on sessions;
create policy "public or unlisted sessions are viewable if not expired" on sessions for select
  using (visibility in ('public', 'unlisted') and deleted_at is null and (expires_at is null or expires_at > now()));

drop policy if exists "anyone can create a session" on sessions;
create policy "anyone can create a session" on sessions for insert with check (true);

drop policy if exists "owner can update own sessions" on sessions;
create policy "owner can update own sessions" on sessions for update using (owner_id = auth.uid());

drop policy if exists "owner can delete own sessions" on sessions;
create policy "owner can delete own sessions" on sessions for delete using (owner_id = auth.uid());

drop policy if exists "items visible if parent session is visible" on items;
create policy "items visible if parent session is visible" on items for select
  using (
    deleted_at is null
    and (status = 'ready' or exists (select 1 from sessions s where s.id = items.session_id and s.owner_id = auth.uid()))
    and exists (select 1 from sessions s where s.id = items.session_id and (s.owner_id = auth.uid() or (s.visibility in ('public','unlisted') and s.deleted_at is null)))
  );

drop policy if exists "anyone can insert items into an existing session" on items;
create policy "anyone can insert items into an existing session" on items for insert with check (true);

drop policy if exists "owner can update own items" on items;
create policy "owner can update own items" on items for update
  using (exists (select 1 from sessions s where s.id = items.session_id and s.owner_id = auth.uid()));

drop policy if exists "owner can delete own items" on items;
create policy "owner can delete own items" on items for delete
  using (exists (select 1 from sessions s where s.id = items.session_id and s.owner_id = auth.uid()));

drop policy if exists "owner can view own analytics" on access_events;
create policy "owner can view own analytics" on access_events for select
  using (exists (select 1 from items i join sessions s on s.id = i.session_id where i.id = access_events.item_id and s.owner_id = auth.uid()));