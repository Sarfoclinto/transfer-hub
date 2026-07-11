import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { resolveItemAccess } from "@/lib/server/item-access";
import { getPresignedDownloadUrl } from "@/lib/storage/r2-client";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: itemId } = await params;

  const access = await resolveItemAccess(itemId, request);
  if (!access.ok) {
    return NextResponse.json(
      { error: access.error },
      { status: access.status },
    );
  }
  const { item } = access;
  const serviceClient = createServiceRoleClient();

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
