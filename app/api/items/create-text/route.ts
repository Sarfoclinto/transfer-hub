import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient, getVerifiedUser } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { verifySessionOwnership } from "@/lib/auth/owner-token";
import { checkGuestItemRateLimit } from "@/lib/rate-limit";
import { createTextItemSchema } from "@/lib/validation/schemas";
import { logger } from "@/lib/logger";

// Text items are simpler than file items by design (Phase 2): no R2, no
// presigned URLs, no upload/confirm cycle -- the content IS the payload,
// so it goes straight into text_content with status 'ready' immediately.
export async function POST(request: Request) {
  const rawBody = await request.json().catch(() => ({}));
  const parsed = createTextItemSchema.safeParse(rawBody);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { session_id, content, language, title, one_time } = parsed.data;

  // Same reasoning as request-upload: a guest session's row fails every
  // RLS SELECT policy by design, so the ownership check needs to read it
  // via service-role first (Phase 3).
  const serviceClient = createServiceRoleClient();
  const { data: session, error: sessionError } = await serviceClient
    .from("sessions")
    .select("id, owner_id, owner_token_hash, deleted_at, expires_at")
    .eq("id", session_id)
    .maybeSingle();

  if (sessionError || !session || session.deleted_at) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }
  if (session.expires_at && new Date(session.expires_at) < new Date()) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  const user = await getVerifiedUser();
  if (!verifySessionOwnership(session, user?.sub ?? null, request)) {
    return NextResponse.json(
      { error: "Not authorized for this session." },
      { status: 403 },
    );
  }

  if (session.owner_id === null) {
    const rateLimitCheck = await checkGuestItemRateLimit(request);
    if (!rateLimitCheck.allowed) {
      return NextResponse.json(
        { error: rateLimitCheck.reason },
        { status: 429 },
      );
    }
  }

  const itemId = randomUUID();

  // Anon-key client, not service-role: the items INSERT policy is
  // `with check (true)` for everyone (Phase 3), and this deliberately
  // does NOT chain .select() -- same lesson from the M2S1 fix, applied
  // from the start here rather than hitting it a third time.
  const supabase = await createClient();
  const { error: insertError } = await supabase.from("items").insert({
    id: itemId,
    session_id,
    kind: "text",
    title: title ?? null,
    text_content: content,
    text_language: language ?? null,
    status: "ready", // immediately ready -- no upload cycle for text
    one_time,
  });

  if (insertError) {
    logger.error("create-text: item insert failed", {
      error: insertError.message,
    });
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({
    item_id: itemId,
    status: "ready",
  });
}
