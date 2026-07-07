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

## Verifying RLS is actually working

Worth a quick sanity check before moving on: in the Studio's **Table
Editor**, try selecting from `sessions` while impersonating an anonymous
role (Studio has a role-switcher) — you should only see rows where
`visibility` is `public` or `unlisted`, never `private` rows belonging to
someone else. If you see everything regardless of visibility, RLS isn't
enabled correctly on that table.
