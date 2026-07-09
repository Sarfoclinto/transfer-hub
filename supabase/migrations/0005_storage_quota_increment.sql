-- Migration 0005: atomic storage-quota increment.
--
-- profiles.storage_used_bytes is a running counter (Phase 1). Updating it
-- via read-then-write from application code (fetch current value, add
-- delta, write back) risks a lost update if two uploads for the same user
-- confirm at nearly the same time -- both read the same starting value,
-- both write, one increment is silently dropped. A single atomic
-- UPDATE...SET x = x + delta closes that gap since Postgres serializes
-- concurrent writers to the same row.
--
-- security definer + explicit search_path, same pattern as
-- handle_new_user() in migration 0001 -- this is called via the
-- service-role client (which already bypasses RLS), but marking it
-- explicitly keeps the function's own behavior correct regardless of
-- which role ends up calling it.
create or replace function increment_storage_used(p_user_id uuid, p_delta bigint)
returns void
language sql
security definer set search_path = public
as $$
  update profiles
  set storage_used_bytes = greatest(0, storage_used_bytes + p_delta)
  where id = p_user_id;
$$;
