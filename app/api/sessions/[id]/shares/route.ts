import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getVerifiedUser } from "@/lib/supabase/server";
import { checkShareAttemptRateLimit } from "@/lib/rate-limit";
import { shareSessionSchema } from "@/lib/validation/schemas";
import { logger } from "@/lib/logger";

// Sharing is authenticated-owner-only (Milestone 9 design, agreed before
// writing this) -- a guest session has no durable identity to build an
// ACL on top of, and more fundamentally the RECIPIENT must already have
// an account, so persisting a share on an ephemeral guest session doesn't
// make sense either. No verifySessionOwnership/X-Owner-Token path here on
// purpose -- unlike every other write endpoint in this app, there is no
// guest branch to support.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await params;

  const user = await getVerifiedUser();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to share a session." },
      { status: 401 },
    );
  }

  const rawBody = await request.json().catch(() => ({}));
  const parsed = shareSessionSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter a valid email address." },
      { status: 400 },
    );
  }

  // Rate-limited by the authenticated caller's identity, not IP -- this is
  // specifically an enumeration control (can an attacker learn which
  // emails have accounts by trying many against this endpoint), and the
  // actor here is always a known account, not an anonymous guest.
  const rateLimitCheck = await checkShareAttemptRateLimit(user.sub);
  if (!rateLimitCheck.allowed) {
    return NextResponse.json({ error: rateLimitCheck.reason }, { status: 429 });
  }

  const serviceClient = createServiceRoleClient();
  const { data: session, error: sessionError } = await serviceClient
    .from("sessions")
    .select("id, owner_id, deleted_at")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionError || !session || session.deleted_at) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }
  if (session.owner_id !== user.sub) {
    return NextResponse.json(
      { error: "Not authorized for this session." },
      { status: 403 },
    );
  }

  // From here on, every path returns this exact same response --
  // whether the email doesn't match any account, matches the owner's own
  // account, matches someone already shared with, matches someone new, or
  // even if the insert itself fails. This is the actual enumeration-safety
  // mechanism (M9S1's design note): the response can never be used to
  // learn whether a given email has an account on this app.
  const genericResponse = NextResponse.json({
    status: "ok",
    message: "If that email has an account, they now have access.",
  });

  const email = parsed.data.email.toLowerCase();
  const { data: recipient } = await serviceClient
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (!recipient || recipient.id === user.sub) {
    return genericResponse;
  }

  const { error: insertError } = await serviceClient
    .from("session_shares")
    .upsert(
      {
        session_id: sessionId,
        shared_with_user_id: recipient.id,
        granted_by: user.sub,
      },
      { onConflict: "session_id,shared_with_user_id", ignoreDuplicates: true },
    );

  if (insertError) {
    logger.error("sessions/[id]/shares: insert failed", {
      error: insertError.message,
    });
    // Still the generic response -- a genuine server error shouldn't leak
    // anything different from "no match" either; the owner can just retry.
  }

  return genericResponse;
}
