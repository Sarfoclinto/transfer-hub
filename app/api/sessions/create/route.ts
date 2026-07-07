import { NextResponse } from "next/server";

// TODO (Milestone 2): create a `sessions` row (guest or authenticated),
// generate + hash an owner_token for guests, return { session_id, owner_token }.
// See Phase 1 (schema) and Phase 3 (owner-token mechanics) of the design doc.
export async function POST() {
  return NextResponse.json(
    { error: "Not implemented yet — lands in Milestone 2." },
    { status: 501 }
  );
}
