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
- ✅ Slice 4: R2 bucket config + presigned URL client (this branch) —
  see `lib/storage/r2-client.ts` and `lib/storage/CORS_SETUP.md`. A
  temporary `GET /api/dev-r2-test` route (non-production only) exists to
  sanity-check the connection before Milestone 2 builds the real flow —
  delete it once that milestone lands.

Note: slices 2, 3, and 4 all branched from the same `main` commit, so any
of them touching shared files (`README.md`, `.env.local.example`,
`package.json`) will produce small, expected conflicts when merged in
sequence -- not a sign of a mistake.

**Milestone 1 is fully built and merged to `main`.** Auth (slices 2+3) has
been tested manually and confirmed working, including Google OAuth. R2
(slice 4) is built but not yet tested end-to-end.

**Milestone 2 — single-file guest upload/download, end-to-end**

- ✅ Slice 1 (this branch): session creation —
  `lib/auth/owner-token.ts` (guest ownership token, hash, constant-time
  verify) + `POST /api/sessions/create` (guest and authenticated paths,
  guest expiration is server-enforced and NOT client-configurable).
  Along the way, replaced the placeholder `Database` type with a real
  hand-authored one matching the migrations -- the placeholder didn't
  typecheck against actual `.from("sessions")` queries.
- ✅ Slice 2 (this branch): MIME/extension policy (`lib/storage/mime-policy.ts`)
  - `POST /api/items/request-upload`. Session-ownership check (guest token
    vs authenticated owner) uses the service-role client to read the
    session row -- a guest's private session fails every RLS SELECT policy
    by design, so there's no anon-key-native way to check "does this caller
    hold the right token." Applied the insert lesson from slice 1's fix
    from the start here: no `.select()` chained on the items insert.
- ✅ Slice 3 (this branch): `POST /api/items/confirm-upload` (HEAD-verifies
  the object actually landed in R2, never trusts the client's claimed
  size) + `GET /api/items/[id]/download` (visibility checks, the atomic
  one-time-link consume from Phase 2, redirects to a fresh presigned URL).
  Factored session-ownership verification into
  `lib/auth/owner-token.ts#verifySessionOwnership` since it's now used by
  three endpoints -- also added `Content-Disposition` signing to upload
  URLs (inline vs attachment per Phase 2), which the temporary
  `dev-r2-test` route has now been deleted in favor of, its job done.
  Password-protected sessions are schema-ready but NOT enforced yet --
  that's Milestone 5.
- ✅ Slice 4 (this branch): real frontend. `components/upload/dropzone.tsx`
  drives the full flow (create session → request-upload → PUT to R2 with
  progress → confirm), homepage hosts it directly. `app/(app)/s/[sessionId]`
  now fetches real data via the plain anon-key client -- works naturally
  for public/unlisted sessions through RLS, no service-role needed for
  reads on this page.

  **Fixed along the way**: session creation was defaulting every session
  to `visibility: 'private'` regardless of who created it. For an
  authenticated user that's fine (they can log in from any device), but
  for a guest it's a dead end -- the owner_token proving ownership only
  ever lives in the creating browser's localStorage, so a private guest
  session can never be opened from a second device. That's exactly the
  workflow this milestone exists to prove. Guests now default to
  `unlisted`; `private` is still available as an explicit opt-in.

  **Known gap, deferred deliberately**: a guest's own _private_ session
  (the opt-in case) can't be viewed even from the same device yet, since
  that would need a client-side fetch reading the localStorage token --
  out of scope for "the common unlisted case," which is what this
  milestone is about. Worth revisiting alongside Milestone 4's dashboard.

**Milestone 2 is complete** -- the core loop (upload from one device, open
the link on another, download) works end to end.

**Milestone 3 — text items + mixed sessions**

- ✅ Slice 1 (this branch): `POST /api/items/create-text` -- text items
  skip the upload/confirm cycle entirely (no R2 involved), going straight
  to `status: 'ready'` since the content itself is the payload. Ownership
  check reuses the same service-role-read-then-verify pattern as file
  uploads, and the insert avoids `.select()` for the same reason as
  before (guest sessions fail RLS SELECT by design).
- ✅ Slice 2 (this branch): mixed-session frontend.
  `components/upload/mixed-upload-form.tsx` is the real orchestrator now
  -- lazily creates one shared session (a cached in-flight promise
  prevents a race where two near-simultaneous adds could split across
  two different sessions), shows a persistent share-link card that stays
  visible while more items get added, and a running list of what's been
  added so far. `dropzone.tsx` was refactored to be session-agnostic (it
  used to own session creation AND a terminal "success" screen, which
  doesn't fit "add several things over time") -- it now just adds one
  file to whatever session it's given via props and reports back.

  **Real bug fixed along the way, unrelated to this slice's own work**:
  authenticated session creation could fail with `violates foreign key
constraint sessions_owner_id_fkey`. Root cause: `sessions.owner_id`
  references `profiles(id)`, not `auth.users(id)` directly, and an
  account created before migration 0001's auto-create trigger existed
  has no matching `profiles` row. Fixed with a backfill migration
  (`0004_backfill_profiles.sql`) plus a defensive upsert in
  `sessions/create` itself, so a missing profile row can't silently
  break session creation again regardless of the cause.
  files, to one session before sharing the link)

- ✅ Slice 3 (this branch): Markdown + code preview, wired into the
  session view page for text items. `components/preview/markdown-preview.tsx`
  (react-markdown + remark-gfm) and `code-preview.tsx`
  (react-syntax-highlighter) both render as Server Components -- neither
  needs browser APIs, so zero extra client JS ships for what's a
  read-only preview. Added `@tailwindcss/typography` for the `prose`
  classes (Tailwind v4 uses a `@plugin` directive in CSS, not the old
  `tailwind.config.js` plugins array).

  **Deliberately NOT built yet**: image/PDF preview. Reusing the existing
  download endpoint for an `<img>` tag would silently consume one-time
  items and pollute download_count/access_events on every render, just
  from a thumbnail loading -- not from an explicit download click. Needs
  a separate non-consuming read path that still refuses one-time items
  entirely (previewing IS an access for something meant to be accessed
  once). Left documented in `image-preview.tsx`/`pdf-preview.tsx`'s stub
  comments; better built alongside Milestone 5 once one-time links have
  an actual UI and this distinction has real stakes to design against.
  code) wired into the session view page

- ✅ Slice 4 (this branch): copy-to-clipboard + text editing, closing out
  Milestone 3. `PATCH /api/items/[id]` implemented (text-only per Phase 4
  MVP scope -- file replacement is a real v2 concern, not attempted).
  `components/preview/text-item-actions.tsx` wraps the server-rendered
  Markdown/code preview via the children-slot pattern, adding Copy
  (works for any viewer) and Edit (owner-only) controls without turning
  the preview components themselves into client components. Ownership
  for the Edit button is a UI convenience only -- computed server-side
  for authenticated owners, and via a client-side localStorage check
  (`useSyncExternalStore`, not `useEffect`+`setState`, per a real lint
  rule this tripped) for guests; the actual security check is the PATCH
  handler's `verifySessionOwnership`, same as every other write.

**Milestone 3 is complete** -- text items, mixed sessions, previews, copy,
and editing all work end to end.

**Milestone 4 — authenticated flow + dashboard**

- ✅ Slice 1 (this branch): storage quota enforcement.
  `lib/storage/quota.ts` defines the 2GB free-tier quota (Phase 3) and a
  `checkQuota` helper. `request-upload` checks it against the account's
  current `storage_used_bytes` before issuing a presigned URL (using the
  client's _claimed_ size -- a cheap first-pass deterrent, not a hard
  guarantee, consistent with the existing size-cap checks elsewhere);
  `confirm-upload` increments the real running total using the
  HEAD-verified _actual_ size, via a new atomic Postgres function
  (`0005_storage_quota_increment.sql`) rather than a read-then-write from
  application code, which would risk a lost update under concurrent
  uploads. Guarded to only increment on the first pending→ready
  transition, so an idempotent re-confirm can't double-count.
- ✅ Slice 2 (this branch): real dashboard, replacing the placeholder
  from Milestone 1. Shows storage usage (`X of 2GB used`, tying back to
  M4S1's quota work) and a list of the user's sessions with a
  type/item-count summary, visibility, created/expiry dates, a Copy Link
  button, and a View link. Sessions and items are fetched as two
  separate queries rather than a PostgREST embedded select --
  `types/database.ts`'s hand-authored `Relationships` are empty arrays,
  so an embedded select would work at runtime but not be meaningfully
  typed; grouping in JS via a `Map` keeps everything type-safe.
  `session-list.tsx` is deliberately a Server Component (not
  `"use client"`) so that `Map` never has to cross the client-props
  serialization boundary -- only the Copy Link button itself is a small
  client island.
- ✅ Slice 3 (this branch): filter + search on the dashboard, done
  client-side over the already-fetched session list rather than a
  separate search endpoint -- a personal dashboard's dataset is small
  enough that this is both simpler and instant, with server-side
  `tsvector` search (the index already exists from Phase 1) staying
  available to swap in later if that assumption stops holding.
  `session-list.tsx` became a Client Component (owns filter/search
  state); `dashboard/page.tsx` now reduces its server-side `Map` into a
  plain, serializable `SessionSummary[]` before handing off to it, since
  the Map itself still can't cross that boundary.
- ✅ Slice 4 (this branch): delete, closing out Milestone 4.
  `DELETE /api/sessions/[id]` soft-deletes the session and cascades to
  its items, releasing an authenticated owner's storage quota
  immediately (via the same atomic RPC as the M4S1 increment) rather
  than waiting for Milestone 6's cleanup cron -- actual R2 object
  deletion still happens there, this is just the logical delete.
  Delete is available both on the dashboard (ownership guaranteed by
  the listing query) and on the session page itself, gated by a new
  `OwnerOnly` wrapper (same localStorage-token-check pattern as
  `TextItemActions`, not yet consolidated into one shared hook since
  there are only two call sites).

  **Real RLS gap fixed along the way**: `"owner can select own
sessions"` and the items visibility policy didn't check `deleted_at`
  in the _owner's own_ read path -- only in the public/unlisted branch.
  A soft-deleted session would have stayed visible to its own owner
  indefinitely. Nothing could trigger this before delete existed, so it
  never surfaced in slices 1-3; fixed in
  `0006_fix_deleted_session_visibility.sql` before it could ship broken.

**Milestone 4 is complete** -- authenticated users have a working
dashboard with quota, search, filtering, and delete.

**Milestone 5 — sharing hardening**

- ✅ Slice 1 (this branch): QR codes. `components/qr-code.tsx`
  (`qrcode.react`, always a white background regardless of theme --
  scanners rely on contrast, dark mode would work against that). Wired
  into both the upload success card (`mixed-upload-form.tsx`) and the
  dashboard (`session-list.tsx`, one card refactored out of the list's
  `.map()` specifically so each card's QR toggle is independent state).
- ✅ Slice 2 (this branch): one-time download links, UI on top of the
  atomic consume logic that's existed since M2S3. `one_time` threads
  through both creation endpoints (a checkbox above the dropzone for
  the next file, a checkbox in the text-add form). `download-button.tsx`
  adds a `confirm()` before navigating for one-time items -- purely a
  courtesy against an accidental click, not a security measure; the
  download endpoint's atomic `UPDATE...WHERE deleted_at IS NULL` is what
  actually enforces the guarantee regardless of what the button does.
  exists from Phase 2/M2S3 -- this slice is the UI to actually set
  `one_time` at creation)
- ✅ Slice 3 (this branch): password-protected sessions. Password set
  once at creation (bcrypt-hashed, `password_hash` column existed since
  Phase 1 but was never enforced until now). `lib/auth/session-unlock.ts`
  signs a stateless, HttpOnly, HMAC-based unlock cookie per session --
  same "casual barrier, not bank-grade" scoping as one-time links and
  guest tokens elsewhere. The creator is auto-unlocked for their own
  session at creation time, no need to immediately re-enter their own
  password. Both the session page AND the download endpoint check the
  gate independently -- a page-level check alone wouldn't stop someone
  hitting the download URL directly, same reasoning as every other
  ownership check in this app.
- ✅ Slice 4 (this branch): image/PDF preview, closing the M3S3 deferral
  and Milestone 5. `GET /api/items/[id]/preview` is a deliberately
  SEPARATE endpoint from `/download`, not a shared path with an intent
  flag -- it never touches `download_count`/consumes one-time items
  (refuses to serve them at all; previewing IS an access for something
  meant to be accessed once), logs `'view'` instead of `'download'`.
  `lib/server/item-access.ts` factors the visibility/expiry/ownership/
  password resolution shared by both endpoints -- `download/route.ts`
  was refactored to use it too, rather than risk two copies of that
  logic drifting apart, same reasoning as `verifySessionOwnership`.
  Video/audio inline players are NOT built this slice (still get a
  working Download button) -- noted in the session page as a scoped-out
  gap, not a silent one.

**Milestone 5 is complete** -- QR codes, one-time links, password
protection, and image/PDF preview all work end to end.

**Milestone 6 — ops & safety baseline**
- ✅ Slice 1 (this branch): Upstash-backed rate limiting for guest
  session creation (10/hour/IP) and guest item creation (30/hour/IP,
  more generous since one mixed-session upload naturally creates
  several items). `lib/rate-limit.ts` degrades to a no-op with a loud
  console warning if `UPSTASH_REDIS_REST_URL`/`TOKEN` aren't set --
  fine for local dev, confirmed working via the build's own output
  (`[rate-limit] ... rate limiting is DISABLED`), NOT fine before a
  public deploy. Authenticated users aren't rate-limited by this --
  they have accountability via login instead.
- ✅ Slice 2 (this branch): rate limiting on password-unlock attempts
  (5 attempts/5 min, keyed by IP + session id -- not IP alone, so
  guessing on one shared link doesn't burn an IP's budget for every
  other password-protected link it might try). Checked BEFORE
  `bcrypt.compare`, and consumed regardless of right/wrong, since every
  attempt should count against a brute-force budget, not just failures.
- ⬜ Slice 3: expiration cleanup cron (soft-delete → R2 cleanup →
  hard-delete)
- ⬜ Slice 4: structured logging baseline

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
