import { NextResponse } from "next/server";

// TODO (Milestone 2): HEAD the R2 object, sniff actual bytes for MIME
// verification, set status to 'scanning' or 'ready' per Phase 2's policy
// (scanning is deferred post-MVP; MVP goes straight to 'ready' after the
// guest-executable-block check passes).
export async function POST() {
  return NextResponse.json(
    { error: "Not implemented yet — lands in Milestone 2." },
    { status: 501 }
  );
}
