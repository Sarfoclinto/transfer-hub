import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { resolveItemAccess } from "@/lib/server/item-access";
import {
  getPresignedDownloadUrl,
  isPreviewableMime,
} from "@/lib/storage/r2-client";

// Deliberately separate from /download, not a shared code path with an
// "intent" flag -- the two have fundamentally different guarantees.
// /download atomically consumes one-time items and counts toward
// download_count/access_events; an <img> tag hitting the same logic on
// every render would silently burn a one-time item's single use just
// from a thumbnail loading, before anyone ever clicked Download. This
// endpoint refuses one-time items outright instead: previewing IS a
// content access for something meant to be accessed exactly once, so
// those items only ever get the explicit Download button, never an
// inline render (see the design note this closes out in
// components/preview/image-preview.tsx's original stub).
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

  if (
    item.kind !== "file" ||
    !item.mime_type ||
    !isPreviewableMime(item.mime_type)
  ) {
    return NextResponse.json({ error: "Not previewable." }, { status: 404 });
  }
  if (item.one_time) {
    return NextResponse.json(
      { error: "One-time items can't be previewed." },
      { status: 404 },
    );
  }

  // Logged as a 'view', not a 'download' -- distinguishes thumbnail
  // renders from explicit download clicks in access_events, and (unlike
  // /download) this never touches download_count at all.
  const serviceClient = createServiceRoleClient();
  await serviceClient.from("access_events").insert({
    item_id: itemId,
    event_type: "view",
  });

  const previewUrl = await getPresignedDownloadUrl(item.storage_key!, 300);
  return NextResponse.redirect(previewUrl, { status: 307 });
}
