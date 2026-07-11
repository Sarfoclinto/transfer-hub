import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getVerifiedUser } from "@/lib/supabase/server";
import { verifySessionOwnership } from "@/lib/auth/owner-token";
import { headObject } from "@/lib/storage/r2-client";
import { confirmUploadSchema } from "@/lib/validation/schemas";
import { logger } from "@/lib/logger";

export async function POST(request: Request) {
  const rawBody = await request.json().catch(() => ({}));
  const parsed = confirmUploadSchema.safeParse(rawBody);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { item_id } = parsed.data;

  // Service-role for both reads here, same reasoning as request-upload: a
  // guest session's row fails every RLS SELECT policy by design, so there's
  // no anon-key-native way to read it for the ownership check that follows.
  const serviceClient = createServiceRoleClient();

  const { data: item, error: itemError } = await serviceClient
    .from("items")
    .select("id, session_id, storage_key, kind, status")
    .eq("id", item_id)
    .maybeSingle();

  if (itemError || !item) {
    return NextResponse.json({ error: "Item not found." }, { status: 404 });
  }
  if (item.kind !== "file") {
    return NextResponse.json(
      { error: "Only file items go through confirm-upload." },
      { status: 400 },
    );
  }
  // Idempotent: calling this twice for an already-ready item just confirms
  // again rather than erroring -- harmless, and avoids a client needing to
  // track "did I already confirm this."
  if (item.status === "rejected") {
    return NextResponse.json(
      { error: "This upload was rejected." },
      { status: 400 },
    );
  }

  const { data: session, error: sessionError } = await serviceClient
    .from("sessions")
    .select("id, owner_id, owner_token_hash, deleted_at")
    .eq("id", item.session_id)
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

  // Never trust the client's claimed size from request-upload -- verify
  // the object actually landed in R2 and get its real size from there
  // (Phase 2). If this HEAD fails, the PUT to R2 either never happened or
  // failed partway through.
  let actualSizeBytes: number | undefined;
  try {
    const head = await headObject(item.storage_key!);
    actualSizeBytes = head.ContentLength;
  } catch {
    return NextResponse.json(
      {
        error:
          "Upload not found in storage. The PUT to upload_url may not have completed.",
      },
      { status: 400 },
    );
  }

  // Virus scanning is deferred post-MVP (Phase 2/4 decision) -- guests were
  // already blocked from risky file types at request-upload time, which is
  // this MVP's mitigation. Once the HEAD check above passes, go straight to
  // 'ready' rather than a 'scanning' intermediate state.
  const { error: updateError } = await serviceClient
    .from("items")
    .update({
      status: "ready",
      size_bytes: actualSizeBytes ?? null,
    })
    .eq("id", item_id);

  if (updateError) {
    logger.error("confirm-upload: item update failed", {
      error: updateError.message,
    });
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Only increment on the FIRST transition to 'ready' -- this endpoint is
  // deliberately idempotent (calling it again for an already-ready item
  // just re-confirms rather than erroring), so guarding on the status we
  // read BEFORE this update prevents double-counting the same file's size
  // if it's confirmed more than once. Guests have no profile/quota to
  // track against (Phase 3), so this only applies to authenticated sessions.
  if (item.status === "pending" && session.owner_id && actualSizeBytes) {
    await serviceClient.rpc("increment_storage_used", {
      p_user_id: session.owner_id,
      p_delta: actualSizeBytes,
    });
  }

  return NextResponse.json({
    item_id,
    status: "ready",
    size_bytes: actualSizeBytes,
  });
}
