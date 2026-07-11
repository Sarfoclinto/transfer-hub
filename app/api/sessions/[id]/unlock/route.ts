import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { signUnlockToken, unlockCookieName } from "@/lib/auth/session-unlock";
import { checkPasswordAttemptRateLimit } from "@/lib/rate-limit";

const unlockSchema = z.object({ password: z.string().min(1) });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await params;
  const rawBody = await request.json().catch(() => ({}));
  const parsed = unlockSchema.safeParse(rawBody);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Password is required." },
      { status: 400 },
    );
  }

  // Service-role: this needs to read password_hash regardless of the
  // session's visibility/ownership, since the whole point is letting an
  // otherwise-unauthorized viewer prove they know the password. RLS has
  // no concept of "prove knowledge of a secret," same class of gap as
  // guest ownership tokens.
  const serviceClient = createServiceRoleClient();
  const { data: session, error } = await serviceClient
    .from("sessions")
    .select("id, password_hash, deleted_at")
    .eq("id", sessionId)
    .maybeSingle();

  if (error || !session || session.deleted_at) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }
  if (!session.password_hash) {
    return NextResponse.json(
      { error: "This session isn't password-protected." },
      { status: 400 },
    );
  }

  // Checked BEFORE bcrypt.compare, and consumed regardless of whether the
  // password turns out to be right or wrong -- this is specifically a
  // brute-force control (Phase 3), so every attempt counts against the
  // budget, not just failed ones (an attacker could otherwise script
  // unlimited guesses as long as they eventually got lucky on attempt N).
  const rateLimitCheck = await checkPasswordAttemptRateLimit(
    request,
    sessionId,
  );
  if (!rateLimitCheck.allowed) {
    return NextResponse.json({ error: rateLimitCheck.reason }, { status: 429 });
  }

  const isMatch = await bcrypt.compare(
    parsed.data.password,
    session.password_hash,
  );
  if (!isMatch) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  const response = NextResponse.json({ status: "unlocked" });
  response.cookies.set(
    unlockCookieName(sessionId),
    signUnlockToken(sessionId),
    {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    },
  );
  return response;
}
