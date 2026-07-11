import { cookies } from "next/headers";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getVerifiedUser } from "@/lib/supabase/server";
import { verifySessionOwnership } from "@/lib/auth/owner-token";
import { verifyUnlockToken, unlockCookieName } from "@/lib/auth/session-unlock";

type ItemRow = {
  id: string;
  session_id: string;
  kind: string;
  storage_key: string | null;
  mime_type: string | null;
  title: string | null;
  original_filename: string | null;
  text_content: string | null;
  status: string;
  deleted_at: string | null;
  one_time: boolean;
  download_count: number;
};

type SessionRow = {
  id: string;
  owner_id: string | null;
  owner_token_hash: string | null;
  visibility: string;
  deleted_at: string | null;
  expires_at: string | null;
  password_hash: string | null;
};

export type ItemAccessResult =
  | { ok: true; item: ItemRow; session: SessionRow; isOwner: boolean }
  | { ok: false; status: number; error: string };

// Shared by download and preview (Phase 2/5) -- both need the exact same
// answer to "is this item visible to this request right now," and having
// that logic in two places risks the same kind of drift the
// verifySessionOwnership factor-out was meant to prevent. What each
// caller does AFTER a successful resolution (consume a one-time link,
// increment counters, generate a presigned URL vs. refuse non-previewable
// types) stays specific to that endpoint.
export async function resolveItemAccess(
  itemId: string,
  request: Request,
): Promise<ItemAccessResult> {
  const serviceClient = createServiceRoleClient();

  const { data: item, error: itemError } = await serviceClient
    .from("items")
    .select(
      "id, session_id, kind, storage_key, mime_type, title, original_filename, text_content, status, deleted_at, one_time, download_count",
    )
    .eq("id", itemId)
    .maybeSingle();

  if (itemError || !item || item.deleted_at || item.status !== "ready") {
    return { ok: false, status: 404, error: "Not found." };
  }

  const { data: session, error: sessionError } = await serviceClient
    .from("sessions")
    .select(
      "id, owner_id, owner_token_hash, visibility, deleted_at, expires_at, password_hash",
    )
    .eq("id", item.session_id)
    .maybeSingle();

  if (sessionError || !session || session.deleted_at) {
    return { ok: false, status: 404, error: "Not found." };
  }
  if (session.expires_at && new Date(session.expires_at) < new Date()) {
    return { ok: false, status: 404, error: "Not found." };
  }

  const user = await getVerifiedUser();
  const isOwner = verifySessionOwnership(session, user?.sub ?? null, request);

  // Password gate is independent of visibility -- a public/unlisted
  // session can still have a password (Phase 4). Owners always bypass
  // their own gate.
  if (session.password_hash && !isOwner) {
    const cookieStore = await cookies();
    const unlockCookie = cookieStore.get(unlockCookieName(session.id))?.value;
    if (!verifyUnlockToken(session.id, unlockCookie)) {
      return { ok: false, status: 401, error: "Password required." };
    }
  }

  const isPubliclyVisible =
    session.visibility === "public" || session.visibility === "unlisted";
  if (!isPubliclyVisible && !isOwner) {
    return { ok: false, status: 404, error: "Not found." };
  }

  return { ok: true, item, session, isOwner };
}
