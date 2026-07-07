# Transfer Hub

A frictionless cross-device clipboard + file transfer hub. Upload from one
device, open on any other, via a link or QR code — no accounts, messaging
apps, or USB drives required.

This repo follows a design doc worked out in five phases before any code was
written: schema, storage/upload flow, auth model, MVP scope, and this
folder/roadmap structure. Implementation is happening milestone by milestone,
each one a testable end-to-end slice rather than one big-bang build.

## Status

**Milestone 1 — Foundations**
- ✅ Slice 1: repo scaffold, folder structure, basic layout shell
- ✅ Slice 2: Supabase schema migrations + RLS policies (this branch) —
  see `supabase/migrations/README.md` for how to apply them to your own
  project. Real generated types land once you've run them (placeholder
  `Database` type in `types/database.ts` until then).
- ✅ Slice 3: Supabase Auth wiring (this branch) — email/password + Google
  OAuth, three-layer auth model (`proxy.ts` refresh/UX-redirect →
  Server Component `getClaims()` verification → RLS as the last line of
  defense). See `app/(auth)/login` and `lib/supabase/`.
- ⬜ Slice 4: R2 bucket config + presigned URL client setup

Note: slices 2 and 3 both touch `README.md` and `types/database.ts`
independently since they branched from the same `main` commit. Expect a
small, easy conflict in those two files when merging whichever PR lands
second — not a sign anything's wrong, just a consequence of parallel
branches touching shared docs/placeholder files.

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- shadcn/ui (set up manually — see note below)
- Supabase (Postgres + Auth + RLS)
- Cloudflare R2 (S3-compatible object storage, zero egress fees)

### Why shadcn/ui is set up by hand

`npx shadcn add <component>` fetches from `ui.shadcn.com`. If that domain
isn't reachable from wherever you're running this, add components manually
using the `components.json` config already in this repo (style: `new-york`,
base color: `neutral`) — copy the component source from shadcn's docs into
`components/ui/`. `button`, `card`, `input`, and `label` are already in place.
If you have network access to `ui.shadcn.com`, the CLI will work normally
going forward.

## Getting started

```bash
npm install
cp .env.local.example .env.local   # fill in values as each slice adds them
npm run dev
```

Nothing will actually work end-to-end until slices 2–4 are done — right now
this just proves the app boots and the layout shell renders.

## Folder structure

See `.env.local.example` for what accounts to create and when. Broadly:

- `app/(marketing)` — public landing page, no auth-aware layout
- `app/(app)` — dashboard + session view, shares the app shell/nav
- `app/api` — route handlers, currently stubs with TODOs pointing at the
  milestone that implements them
- `lib/supabase` — three separate clients (browser, server, service-role).
  `service-role.ts` is isolated deliberately — it's the only client that
  bypasses Row Level Security, used solely for the guest owner-token write
  path. Don't import it for convenience elsewhere.
- `lib/storage` — R2 client + MIME policy enforcement
- `lib/auth` — guest owner-token generation/verification
- `supabase/migrations` — SQL migrations, one per schema change

## Design doc summary

- **Schema**: `sessions` → `items` (one row per session, many items — the
  "mixed upload" case), guest ownership via a hashed owner-token rather than
  Supabase anonymous auth, an explicit `status` state machine
  (`pending → scanning → ready → rejected`) enforced at the RLS level.
- **Storage**: uploads go client → R2 directly via presigned URLs, never
  through the Next.js server. Virus scanning is deferred post-MVP; guests are
  restricted from executable file types as the interim mitigation.
- **Auth**: Supabase RLS for the authenticated path; guests are verified via
  a token-in-header pattern with a service-role bypass for that one verified
  write, since Postgres has no native concept of "bearer token owns this row."
- **MVP**: full upload/download/share loop, password-protected + one-time
  links, dashboard with search/filter — versioning, tags, folder uploads,
  and virus scanning explicitly deferred.
