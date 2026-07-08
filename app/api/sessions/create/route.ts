import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient, getVerifiedUser } from "@/lib/supabase/server";
import { generateOwnerToken, hashOwnerToken } from "@/lib/auth/owner-token";
import { createSessionSchema } from "@/lib/validation/schemas";

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
  const { title, visibility, expiresInDays } = parsed.data;

  const user = await getVerifiedUser();
  const supabase = await createClient();

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
      expires_at: expiresAt.toISOString(),
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      session_id: id,
      visibility,
      expires_at: expiresAt.toISOString(),
      // no owner_token -- ownership is via auth.uid() + RLS for this path
    });
  }

  // Guest path: expiration is NOT client-configurable, regardless of what
  // expiresInDays was set to above -- guests always get the short, fixed
  // window (Phase 4's guest quota policy).
  const rawToken = generateOwnerToken();
  const tokenHash = hashOwnerToken(rawToken);
  const expiresAt = new Date(Date.now() + GUEST_EXPIRY_HOURS * 60 * 60 * 1000);
  const id = randomUUID();

  const { error } = await supabase.from("sessions").insert({
    id,
    owner_token_hash: tokenHash,
    title: title ?? null,
    visibility,
    expires_at: expiresAt.toISOString(),
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    session_id: id,
    owner_token: rawToken, // returned ONCE -- client must store this itself
    visibility,
    expires_at: expiresAt.toISOString(),
  });
}
