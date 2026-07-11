import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { createClient, getVerifiedUser } from "@/lib/supabase/server";
import { generateOwnerToken, hashOwnerToken } from "@/lib/auth/owner-token";
import { signUnlockToken, unlockCookieName } from "@/lib/auth/session-unlock";
import { checkGuestSessionRateLimit } from "@/lib/rate-limit";
import { createSessionSchema } from "@/lib/validation/schemas";
import { logger } from "@/lib/logger";

const GUEST_EXPIRY_HOURS = 48;
const AUTHED_DEFAULT_EXPIRY_DAYS = 90;

export async function POST(request: Request) {
  const rawBody = await request.json().catch(() => ({}));
  const parsed = createSessionSchema.safeParse(rawBody);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const {
    title,
    visibility: requestedVisibility,
    expiresInDays,
    password,
  } = parsed.data;

  // Hashed once, used by whichever path below actually runs. bcrypt cost
  // factor 10 is a reasonable default for a casual-sharing feature -- this
  // isn't guarding anything more sensitive than "don't let a random link-
  // guesser in," not an account credential.
  const passwordHash = password ? await bcrypt.hash(password, 10) : null;

  const user = await getVerifiedUser();
  const supabase = await createClient();

  // Visibility default depends on who's creating the session, not a single
  // schema-level default -- these two cases genuinely need different
  // defaults, not just different data:
  //
  // Authenticated: 'private' is a real, useful default. The owner can view
  // it from any device by logging in (RLS via auth.uid()), so "private"
  // doesn't mean "unreachable" for them.
  //
  // Guest: 'private' would be a dead end. There's no cross-device auth for
  // guests -- the owner_token proving ownership lives only in the creating
  // browser's localStorage. A private guest session is therefore only ever
  // manageable from the same device/browser, which defeats the core
  // "upload from A, open the link on B" workflow this whole app exists for.
  // 'unlisted' (viewable via the link, not indexed/discoverable) is the
  // sensible default here -- a guest can still explicitly request 'private'
  // if they specifically want a same-device-only session, but it's an
  // opt-in, not something that silently breaks their first share attempt.

  // Note on RLS here: the "anyone can create a session" insert policy
  // (Phase 3) has `with check (true)` -- it doesn't require auth.uid(), so
  // this same anon-key client works for both guests and authenticated users
  // for the INSERT itself. The distinction between the two paths below is
  // purely application logic (Postgres doesn't know or care who's inserting).
  //
  // Deliberately NOT chaining .select() on the insert: Postgres checks a
  // RETURNING clause against the table's SELECT policies too, and a guest's
  // freshly-created private session (owner_id null, visibility 'private')
  // legitimately fails every SELECT policy -- that's correct, by design,
  // since guests aren't covered by RLS at all (Phase 3). Rather than reach
  // for the service-role client to work around that, we just generate the
  // id ourselves and return the values we already computed -- no read-back
  // needed for a row we just wrote with data we already have in hand.
  if (user) {
    // Defensive self-heal: sessions.owner_id references profiles(id), not
    // auth.users(id) directly, and the profiles row is normally created by
    // a trigger firing on auth.users insert. If that row is somehow
    // missing -- e.g. an account created before the trigger existed, which
    // is exactly the bug this comment is here because of -- the insert
    // below would fail its foreign key constraint. Upserting here means
    // that gap can't silently break session creation again, regardless of
    // why the profile row was missing. `ignoreDuplicates` makes this a
    // no-op if the row already exists (the common case), so this isn't
    // doing meaningful extra work on every request.
    await supabase
      .from("profiles")
      .upsert({ id: user.sub }, { ignoreDuplicates: true });

    const visibility = requestedVisibility ?? "private";
    const days = expiresInDays
      ? Math.min(expiresInDays, AUTHED_DEFAULT_EXPIRY_DAYS)
      : AUTHED_DEFAULT_EXPIRY_DAYS;
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    const id = randomUUID();

    const { error } = await supabase.from("sessions").insert({
      id,
      owner_id: user.sub,
      title: title ?? null,
      visibility,
      password_hash: passwordHash,
      expires_at: expiresAt.toISOString(),
    });

    if (error) {
      logger.error("sessions/create: session insert failed", {
        error: error.message,
      });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const response = NextResponse.json({
      session_id: id,
      visibility,
      expires_at: expiresAt.toISOString(),
      // no owner_token -- ownership is via auth.uid() + RLS for this path
    });

    // Auto-unlock for the creator -- they just set this password, they
    // shouldn't immediately have to re-enter it to view their own session.
    if (passwordHash) {
      response.cookies.set(unlockCookieName(id), signUnlockToken(id), {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 365,
        path: "/",
      });
    }

    return response;
  }

  // Guest path: expiration is NOT client-configurable, regardless of what
  // expiresInDays was set to above -- guests always get the short, fixed
  // window (Phase 4's guest quota policy).
  const rateLimitCheck = await checkGuestSessionRateLimit(request);
  if (!rateLimitCheck.allowed) {
    return NextResponse.json({ error: rateLimitCheck.reason }, { status: 429 });
  }

  const rawToken = generateOwnerToken();
  const tokenHash = hashOwnerToken(rawToken);
  const expiresAt = new Date(Date.now() + GUEST_EXPIRY_HOURS * 60 * 60 * 1000);
  const id = randomUUID();
  const visibility = requestedVisibility ?? "unlisted";

  const { error } = await supabase.from("sessions").insert({
    id,
    owner_token_hash: tokenHash,
    title: title ?? null,
    visibility,
    password_hash: passwordHash,
    expires_at: expiresAt.toISOString(),
  });

  if (error) {
    logger.error("sessions/create: session insert failed", {
      error: error.message,
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const response = NextResponse.json({
    session_id: id,
    owner_token: rawToken, // returned ONCE -- client must store this itself
    visibility,
    expires_at: expiresAt.toISOString(),
  });

  if (passwordHash) {
    response.cookies.set(unlockCookieName(id), signUnlockToken(id), {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });
  }

  return response;
}
