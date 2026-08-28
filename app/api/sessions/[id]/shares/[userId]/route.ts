import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getVerifiedUser } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  const { id: sessionId, userId } = await params;

  const user = await getVerifiedUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
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

  const { error: deleteError } = await serviceClient
    .from("session_shares")
    .delete()
    .eq("session_id", sessionId)
    .eq("shared_with_user_id", userId);

  if (deleteError) {
    logger.error("sessions/[id]/shares/[userId]: revoke failed", {
      error: deleteError.message,
    });
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ status: "revoked" });
}
