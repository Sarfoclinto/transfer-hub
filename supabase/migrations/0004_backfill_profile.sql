-- Migration 0004: backfill missing profiles rows + let a user self-heal.
--
-- Root cause of a real bug hit while testing: sessions.owner_id references
-- profiles(id), not auth.users(id) directly. profiles rows are normally
-- created by the on_auth_user_created trigger firing on auth.users insert.
-- Any account created BEFORE migration 0001 (which defines that trigger)
-- was applied has no profiles row at all -- inserting a session for that
-- user then fails "violates foreign key constraint sessions_owner_id_fkey".
--
-- This migration does three things, all safe to run any number of times:
--   1. Re-installs the trigger/function idempotently (in case it's missing
--      or was altered, same class of issue as migration 0003).
--   2. Backfills a profiles row for every existing auth.users row that's
--      missing one.
--   3. Adds an INSERT policy so an authenticated client can also self-heal
--      its own missing profile row going forward (see the app-code change
--      in app/api/sessions/create/route.ts) -- defense in depth, so this
--      doesn't depend on the trigger alone ever again.

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- Backfill: anyone in auth.users missing a profiles row gets one now.
insert into profiles (id)
select u.id from auth.users u
where not exists (select 1 from profiles p where p.id = u.id);

-- Let a logged-in user insert their OWN profile row if it's somehow still
-- missing (belt-and-suspenders alongside the trigger, not a replacement
-- for it -- the trigger is still the primary mechanism for new signups).
drop policy if exists "users can insert their own profile" on profiles;
create policy "users can insert their own profile"
  on profiles for insert
  with check (id = auth.uid());
