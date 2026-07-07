import { NextResponse } from "next/server";

// TODO (Milestone 2/5): check status/visibility/expiration, generate a
// short-lived R2 presigned GET URL, handle the one-time-link atomic delete
// (Phase 2), log an access_event.
export async function GET() {
  return NextResponse.json(
    { error: "Not implemented yet — lands in Milestone 2." },
    { status: 501 }
  );
}
