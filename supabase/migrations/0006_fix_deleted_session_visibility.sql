-- Migration 0006: soft-deleted rows must be invisible to EVERYONE,
-- including the owner -- not just to non-owner/public viewers.
--
-- Bug found while building session delete (M4S4): "owner can select own
-- sessions" only checked `owner_id = auth.uid()`, with no deleted_at
-- condition at all. The public/unlisted SELECT policy on sessions checked
-- deleted_at correctly, but the owner's own policy didn't -- meaning a
-- soft-deleted session would still show up for its own owner (dashboard,
-- direct link) even though it's supposed to be gone. Same gap existed one
-- level down: the "items visible if parent session is visible" policy
-- checked the session's deleted_at only in the public/unlisted branch of
-- its OR, not the owner branch.
--
-- This didn't cause any incorrect behavior in slices 1-3 since nothing
-- could soft-delete a session yet -- it's a real gap that would have
-- surfaced the moment delete actually shipped without this fix.

drop policy if exists "owner can select own sessions" on sessions;
create policy "owner can select own sessions"
  on sessions for select
  using (owner_id = auth.uid() and deleted_at is null);

drop policy if exists "items visible if parent session is visible" on items;
create policy "items visible if parent session is visible"
  on items for select
  using (
    deleted_at is null
    and (
      status = 'ready'
      or exists (
        select 1 from sessions s
        where s.id = items.session_id and s.owner_id = auth.uid() and s.deleted_at is null
      )
    )
    and exists (
      select 1 from sessions s
      where s.id = items.session_id
        and (
          (s.owner_id = auth.uid() and s.deleted_at is null)
          or (s.visibility in ('public', 'unlisted') and s.deleted_at is null)
        )
    )
  );
