import { NextResponse } from "next/server";
import { getPresignedUploadUrl, getPresignedDownloadUrl } from "@/lib/storage/r2-client";

// TEMPORARY -- delete this route once Milestone 2's real
// /api/items/request-upload and /api/items/confirm-upload exist. This exists
// solely to let us verify the R2 credentials + CORS config actually work
// before building the real DB-backed flow on top of them.
//
// Note: this was originally under app/api/_dev/r2-test/, but Next.js treats
// any `_`-prefixed folder as a private folder EXCLUDED from routing -- that
// route would have silently 404'd always, not just in production. Moved to
// app/api/dev-r2-test/ instead; the NODE_ENV check below is the real guard
// (this issues presigned URLs with zero auth/ownership checks, which is
// fine for a local sanity check and not fine for anything internet-facing).
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production." }, { status: 404 });
  }

  const testKey = `_dev-test/${Date.now()}.txt`;

  try {
    const uploadUrl = await getPresignedUploadUrl(testKey, "text/plain", 300);
    const downloadUrl = await getPresignedDownloadUrl(testKey, 300);

    return NextResponse.json({
      key: testKey,
      uploadUrl,
      downloadUrl,
      instructions: [
        `curl -X PUT --data-binary "hello from r2" -H "Content-Type: text/plain" "${uploadUrl}"`,
        `curl "${downloadUrl}"`,
      ],
    });
  } catch (err) {
    return NextResponse.json(
      { error: "R2 request failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
