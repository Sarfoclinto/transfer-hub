import { NextResponse } from "next/server";

// TODO (Milestone 6): find sessions past expires_at, soft-delete session +
// items, queue R2 object deletion, hard-delete rows after the buffer window.
// Triggered by Vercel Cron (or Supabase pg_cron) per Phase 2.
export async function GET() {
  return NextResponse.json(
    { error: "Not implemented yet — lands in Milestone 6." },
    { status: 501 }
  );
}
