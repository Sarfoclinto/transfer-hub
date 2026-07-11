import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getVerifiedUser } from "@/lib/supabase/server";
import { verifySessionOwnership } from "@/lib/auth/owner-token";
import { verifyUnlockToken, unlockCookieName } from "@/lib/auth/session-unlock";
import { getPresignedDownloadUrl } from "@/lib/storage/r2-client";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: itemId } = await params;
  const serviceClient = createServiceRoleClient();

  const { data: item, error: itemError } = await serviceClient
    .from("items")
    .select(
      "id, session_id, kind, storage_key, mime_type, title, original_filename, text_content, status, deleted_at, one_time, download_count",
    )
    .eq("id", itemId)
    .maybeSingle();

  if (itemError || !item || item.deleted_at || item.status !== "ready") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const { data: session, error: sessionError } = await serviceClient
    .from("sessions")
    .select(
      "id, owner_id, owner_token_hash, visibility, deleted_at, expires_at, password_hash",
    )
    .eq("id", item.session_id)
    .maybeSingle();

  if (sessionError || !session || session.deleted_at) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (session.expires_at && new Date(session.expires_at) < new Date()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const user = await getVerifiedUser();
  const isOwner = verifySessionOwnership(session, user?.sub ?? null, request);

  // Password gate is independent of visibility -- a public or unlisted
  // session can still have a password set (Phase 4: an orthogonal extra
  // layer, not tied to visibility). Owners always bypass their own gate.
  // This is the same check as the session page's gate, checked
  // independently here since a page-level gate alone wouldn't stop
  // someone hitting this URL directly.
  if (session.password_hash && !isOwner) {
    const cookieStore = await cookies();
    const unlockCookie = cookieStore.get(unlockCookieName(session.id))?.value;
    if (!verifyUnlockToken(session.id, unlockCookie)) {
      return NextResponse.json(
        { error: "Password required." },
        { status: 401 },
      );
    }
  }

  const isPubliclyVisible =
    session.visibility === "public" || session.visibility === "unlisted";
  if (!isPubliclyVisible && !isOwner) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  // One-time links: the atomic gate from Phase 2. A plain check-then-act
  // (read deleted_at, then update) would race if two requests hit this
  // near-simultaneously -- both could pass the check before either writes.
  // This update's WHERE clause makes Postgres itself the only arbiter of
  // who "wins": whichever request's UPDATE actually matches a row (because
  // deleted_at was still null at that instant) is the one that gets to
  // proceed. Postgres serializes concurrent writers to the same row, so
  // exactly one of two simultaneous requests will see a returned row here.
  if (item.one_time) {
    const { data: consumed, error: consumeError } = await serviceClient
      .from("items")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", itemId)
      .is("deleted_at", null)
      .select("id");

    if (consumeError) {
      return NextResponse.json(
        { error: consumeError.message },
        { status: 500 },
      );
    }
    if (!consumed || consumed.length === 0) {
      return NextResponse.json(
        { error: "This link has already been used." },
        { status: 410 },
      );
    }
  }

  // Best-effort logging/counters -- not wrapped in the same atomicity
  // concerns as the one-time gate above, since a lost increment or a
  // missed log entry here is low-stakes (analytics, not access control).
  await serviceClient.from("access_events").insert({
    item_id: itemId,
    event_type: "download",
  });
  await serviceClient
    .from("items")
    .update({ download_count: item.download_count + 1 })
    .eq("id", itemId);

  if (item.kind === "text") {
    const filename =
      item.original_filename ?? `${item.title ?? "download"}.txt`;
    return new NextResponse(item.text_content ?? "", {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  // File items: redirect to a freshly-generated presigned URL rather than
  // returning it as JSON -- this endpoint can be used directly as a
  // download link/href, and the presigned URL itself is deliberately
  // short-lived and regenerated per request (Phase 2) -- this endpoint's
  // own URL is the stable, shareable one.
  const downloadUrl = await getPresignedDownloadUrl(item.storage_key!, 300);
  return NextResponse.redirect(downloadUrl, { status: 307 });
}
