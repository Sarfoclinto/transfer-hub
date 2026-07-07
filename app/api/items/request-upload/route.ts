import { NextResponse } from "next/server";

// TODO (Milestone 2): validate size/mime against the guest-vs-authed policy
// (Phase 2), create a `pending` items row, generate an R2 presigned PUT URL,
// return { upload_url, item_id }.
export async function POST() {
  return NextResponse.json(
    { error: "Not implemented yet — lands in Milestone 2." },
    { status: 501 }
  );
}
