import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getVerifiedUser } from "@/lib/supabase/server";
import { verifySessionOwnership } from "@/lib/auth/owner-token";
import { updateItemSchema } from "@/lib/validation/schemas";
import { logger } from "@/lib/logger";

// TODO (Milestone 4): GET item metadata (RLS-gated) -- not needed yet since
// the session page reads items directly via the anon client; this becomes
// useful once the dashboard needs to fetch a single item outside that context.
export async function GET() {
  return NextResponse.json(
    { error: "Not implemented yet — lands in Milestone 4." },
    { status: 501 },
  );
}

// title (rename) works for any item kind -- it's a display-label override,
// not a content change. text_content stays text-only, enforced below
// since zod's schema alone can't know the item's kind at validation time.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: itemId } = await params;
  const rawBody = await request.json().catch(() => ({}));
  const parsed = updateItemSchema.safeParse(rawBody);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Service-role for the reads here, same reasoning as every other
  // ownership-gated endpoint: a guest session's row fails every RLS SELECT
  // policy by design, so there's no anon-key-native way to check "does this
  // caller hold the right token" (Phase 3).
  const serviceClient = createServiceRoleClient();
  const { data: item, error: itemError } = await serviceClient
    .from("items")
    .select("id, session_id, kind, deleted_at")
    .eq("id", itemId)
    .maybeSingle();

  if (itemError || !item || item.deleted_at) {
    return NextResponse.json({ error: "Item not found." }, { status: 404 });
  }
  if (parsed.data.text_content !== undefined && item.kind !== "text") {
    return NextResponse.json(
      { error: "Only text items have editable content." },
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
      { error: "Not authorized for this item." },
      { status: 403 },
    );
  }

  // Service-role for the write too: the items UPDATE RLS policy requires
  // owner_id = auth.uid(), which a guest session (owner_id null) can never
  // satisfy regardless of who's asking. We've already verified ownership
  // ourselves above via verifySessionOwnership -- this write is the
  // legitimate, narrow case service-role exists for (Phase 3).
  const updatePayload: { title?: string | null; text_content?: string } = {};
  if (parsed.data.title !== undefined) {
    // Empty/whitespace-only clears the rename, reverting display to
    // original_filename (files) or "Text note" (text) -- see
    // lib/display-title.ts for the precedence.
    updatePayload.title = parsed.data.title.trim() || null;
  }
  if (parsed.data.text_content !== undefined) {
    updatePayload.text_content = parsed.data.text_content;
  }

  const { error: updateError } = await serviceClient
    .from("items")
    .update(updatePayload)
    .eq("id", itemId);

  if (updateError) {
    logger.error("items/[id]: update failed", { error: updateError.message });
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ item_id: itemId, status: "updated" });
}

// TODO (Milestone 4): DELETE for owner/guest-token-verified removal --
// deferred until the dashboard actually needs it (no delete UI exists yet).
export async function DELETE() {
  return NextResponse.json(
    { error: "Not implemented yet — lands in Milestone 4." },
    { status: 501 },
  );
}
