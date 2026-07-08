# Applying these migrations

Two ways to run these against your Supabase project — pick whichever's less
friction for you.

## Option A — Supabase Studio SQL Editor (fastest, no CLI needed)

1. Open your project on supabase.com → **SQL Editor**
2. Paste the contents of `0001_core_schema.sql`, run it
3. Paste the contents of `0002_rls_policies.sql`, run it
4. (Optional, local/demo data only) paste `seed.sql` and run it — don't run
   this against a real production project, it's just for testing the UI
   before the real upload flow exists

## Option B — Supabase CLI (better if you want migrations tracked properly)

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

`db push` applies any migration files in this folder that haven't been
applied yet, in filename order — which is why they're numbered (`0001_`,
`0002_`, ...). Always add new migrations as new numbered files, never edit
an already-applied one, so the history stays honest.

## After applying

Generate real TypeScript types against your project (replace the placeholder
in `types/database.ts`):

```bash
npx supabase gen types typescript --linked > types/database.ts
```

## Troubleshooting: "violates foreign key constraint sessions_owner_id_fkey"

This means the signed-in user has an `auth.users` row but no matching
`profiles` row -- usually because their account was created before
migration 0001 (which defines the trigger that auto-creates `profiles`
rows) was applied to this project. Run `0004_backfill_profiles.sql` --
it's safe to run any number of times, and also adds a policy letting a
user self-heal their own missing profile going forward. The app itself
also defensively upserts a profile row before creating a session now, so
this shouldn't resurface even for edge cases the backfill doesn't catch.

## Troubleshooting: "new row violates row-level security policy"

If an insert that should be allowed (e.g. `with check (true)` on
`sessions`) fails with this error, it almost always means a policy is
missing -- usually because an earlier statement in a migration errored
mid-script (like re-running the same file twice and hitting "policy
already exists"), and the SQL editor stopped before reaching a later
policy. Check what actually exists:

```sql
select policyname, cmd, roles, with_check from pg_policies where tablename = 'sessions';
```

If policies are missing, run `0003_fix_rls_policies_idempotent.sql` --
it's safe to run any number of times (drops each policy if present, then
recreates it), so it's a reasonable first thing to try whenever RLS
behaves unexpectedly.

## Verifying RLS is actually working

Worth a quick sanity check before moving on: in the Studio's **Table
Editor**, try selecting from `sessions` while impersonating an anonymous
role (Studio has a role-switcher) — you should only see rows where
`visibility` is `public` or `unlisted`, never `private` rows belonging to
someone else. If you see everything regardless of visibility, RLS isn't
enabled correctly on that table.
