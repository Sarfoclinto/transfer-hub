import { NextResponse } from "next/server";

// TODO (Milestone 3/4): GET item metadata (RLS-gated), PATCH for text edits
// (Phase 4 MVP scope — text only, not file replacement), DELETE for
// owner/guest-token-verified removal.
export async function GET() {
  return NextResponse.json(
    { error: "Not implemented yet — lands in Milestone 3." },
    { status: 501 }
  );
}

export async function PATCH() {
  return NextResponse.json(
    { error: "Not implemented yet — lands in Milestone 3." },
    { status: 501 }
  );
}

export async function DELETE() {
  return NextResponse.json(
    { error: "Not implemented yet — lands in Milestone 3/4." },
    { status: 501 }
  );
}
