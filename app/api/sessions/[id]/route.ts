import { NextResponse } from "next/server";

// TODO (Milestone 2/4): GET returns session + items (RLS-gated per Phase 3).
// PATCH/DELETE require either auth.uid() ownership or a valid X-Owner-Token
// header for guest sessions, verified against the hashed token in Postgres.
export async function GET() {
  return NextResponse.json(
    { error: "Not implemented yet — lands in Milestone 2." },
    { status: 501 }
  );
}

export async function PATCH() {
  return NextResponse.json(
    { error: "Not implemented yet — lands in Milestone 2/4." },
    { status: 501 }
  );
}

export async function DELETE() {
  return NextResponse.json(
    { error: "Not implemented yet — lands in Milestone 2/4." },
    { status: 501 }
  );
}
