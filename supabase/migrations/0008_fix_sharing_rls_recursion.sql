-- Migration 0008: fix infinite recursion in the sharing RLS policies
-- from 0007.
--
-- Found via a real production outage: `set role anon; select * from
-- sessions limit 1;` returned "infinite recursion detected in policy
-- for relation sessions" (Postgres 42P17), breaking every read of
-- sessions -- the dashboard, the public gallery, everything -- for
-- every user, logged in or not.
--
-- Root cause: "shared-with user can select the session" (on sessions)
-- queries session_shares. session_shares has its own RLS policy,
-- "owner can see shares on their own sessions", which queries sessions
-- right back -- re-triggering evaluation of ALL of sessions' SELECT
-- policies, including the shared-with one, looping into session_shares
-- again indefinitely. A genuine circular reference between the two new
-- policy sets added in 0007.
--
-- Fix: a SECURITY DEFINER helper function. A function created this way
-- executes with the privileges of its owner (the migration-running
-- role, which has BYPASSRLS in Supabase) -- so its internal queries
-- against session_shares/sessions never trigger THEIR RLS policies at
-- all, breaking the cycle at its root rather than trying to reorder or
-- out-clever policy evaluation.

create or replace function is_session_shared_with_me(p_session_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from session_shares ss
    join sessions s on s.id = ss.session_id
    where ss.session_id = p_session_id
      and ss.shared_with_user_id = auth.uid()
      and s.deleted_at is null
  );
$$;

grant execute on function is_session_shared_with_me(uuid) to anon, authenticated;

drop policy if exists "shared-with user can select the session" on sessions;
create policy "shared-with user can select the session"
  on sessions for select
  using (
    deleted_at is null
    and is_session_shared_with_me(sessions.id)
  );

drop policy if exists "shared-with user can select ready items" on items;
create policy "shared-with user can select ready items"
  on items for select
  using (
    deleted_at is null
    and status = 'ready'
    and is_session_shared_with_me(items.session_id)
  );
