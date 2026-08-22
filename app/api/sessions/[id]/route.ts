import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getVerifiedUser } from "@/lib/supabase/server";
import { verifySessionOwnership } from "@/lib/auth/owner-token";
import { logger } from "@/lib/logger";
import { updateSessionSchema } from "@/lib/validation/schemas";

// TODO (Milestone 4+ if ever needed): GET a single session's metadata --
// not built yet since nothing currently needs it outside the contexts that
// already fetch sessions directly (session page, dashboard both use the
// anon client via RLS).
export async function GET() {
  return NextResponse.json({ error: "Not implemented yet." }, { status: 501 });
}

// Rename only, for now -- visibility/password/expiry changes after
// creation are a real feature but a separate one (each has its own
// considerations: changing visibility on an already-shared link has
// different stakes than changing a display label, changing a password
// affects the unlock cookie's validity, etc.). Keeping this endpoint's
// scope to just the title avoids conflating them.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await params;
  const rawBody = await request.json().catch(() => ({}));
  const parsed = updateSessionSchema.safeParse(rawBody);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const serviceClient = createServiceRoleClient();
  const { data: session, error: sessionError } = await serviceClient
    .from("sessions")
    .select("id, owner_id, owner_token_hash, deleted_at")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionError || !session || session.deleted_at) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  const user = await getVerifiedUser();
  if (!verifySessionOwnership(session, user?.sub ?? null, request)) {
    return NextResponse.json(
      { error: "Not authorized for this session." },
      { status: 403 },
    );
  }

  // An empty/whitespace-only title clears the explicit title rather than
  // storing an empty string -- reverts display to the auto-generated
  // content-derived label (lib/display-title.ts) instead of showing
  // nothing.
  const title = parsed.data.title.trim() || null;

  const { error: updateError } = await serviceClient
    .from("sessions")
    .update({ title })
    .eq("id", sessionId);

  if (updateError) {
    logger.error("sessions/[id]: rename update failed", {
      error: updateError.message,
    });
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ session_id: sessionId, title });
}

// Soft-delete only -- actual R2 object deletion is Milestone 6's cleanup
// cron's job (Phase 2), not this endpoint's. This just marks the session
// (and its items) deleted_at so they stop being visible/accessible
// everywhere, and immediately releases any authenticated owner's storage
// quota rather than waiting for that later cleanup pass.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await params;
  const serviceClient = createServiceRoleClient();

  const { data: session, error: sessionError } = await serviceClient
    .from("sessions")
    .select("id, owner_id, owner_token_hash, deleted_at")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionError || !session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  const user = await getVerifiedUser();
  if (!verifySessionOwnership(session, user?.sub ?? null, request)) {
    return NextResponse.json(
      { error: "Not authorized for this session." },
      { status: 403 },
    );
  }

  // Idempotent: deleting an already-deleted session just confirms success
  // rather than erroring -- the end state the caller wanted is already true.
  if (session.deleted_at) {
    return NextResponse.json({ session_id: sessionId, status: "deleted" });
  }

  // Release quota immediately for an authenticated owner, using the same
  // atomic RPC as the increment in confirm-upload -- read-then-write here
  // would have the same lost-update risk under concurrent requests.
  if (session.owner_id) {
    const { data: fileItems } = await serviceClient
      .from("items")
      .select("size_bytes")
      .eq("session_id", sessionId)
      .eq("kind", "file")
      .is("deleted_at", null);

    const totalBytes = (fileItems ?? []).reduce(
      (sum, item) => sum + (item.size_bytes ?? 0),
      0,
    );
    if (totalBytes > 0) {
      await serviceClient.rpc("increment_storage_used", {
        p_user_id: session.owner_id,
        p_delta: -totalBytes,
      });
    }
  }

  const now = new Date().toISOString();
  await serviceClient
    .from("items")
    .update({ deleted_at: now })
    .eq("session_id", sessionId)
    .is("deleted_at", null);
  const { error: deleteError } = await serviceClient
    .from("sessions")
    .update({ deleted_at: now })
    .eq("id", sessionId);

  if (deleteError) {
    logger.error("sessions/[id]: delete update failed", {
      error: deleteError.message,
    });
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ session_id: sessionId, status: "deleted" });
}
