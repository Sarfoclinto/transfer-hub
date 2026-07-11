import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { deleteObject } from "@/lib/storage/r2-client";

// How long a session sits soft-deleted before its R2 objects and DB rows
// are actually removed. This buffer exists specifically so a wrongly-
// expired session (an expiry bug, a clock issue, whatever) is recoverable
// for a week rather than unrecoverably gone the moment it's flagged --
// see Phase 2's original reasoning for this design.
const HARD_DELETE_BUFFER_DAYS = 7;

// Safety cap per run, per phase -- protects a single invocation from
// trying to process an unbounded backlog and timing out. If a backlog
// exceeds this, the next scheduled run keeps chipping away at it; nothing
// is lost by spreading the work across runs.
const BATCH_LIMIT = 200;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Same philosophy as rate-limit.ts's graceful degradation: warn loudly
    // rather than block. The actual damage an unauthenticated caller could
    // do here is limited -- this only ever touches rows already past their
    // expiration or already soft-deleted for a week, never live data an
    // attacker could use this to destroy early.
    console.warn(
      "[cleanup-cron] CRON_SECRET not set -- this endpoint is unauthenticated. " +
        "Low risk (it only processes already-expired/already-deleted rows), but set it before a public deploy.",
    );
    return true;
  }
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const serviceClient = createServiceRoleClient();
  const now = new Date().toISOString();

  // --- Phase 1: expire sessions past their expires_at, not yet soft-deleted ---
  // Soft-delete only here -- no R2 touch yet. This is also exactly what
  // the manual DELETE endpoint (M4S4) does at delete time, so an expired
  // session and a manually-deleted one converge to the same state and get
  // handled identically by phase 2 below, regardless of which path got
  // them there.
  const { data: expiredSessions } = await serviceClient
    .from("sessions")
    .select("id, owner_id")
    .is("deleted_at", null)
    .lt("expires_at", now)
    .limit(BATCH_LIMIT);

  let expiredCount = 0;
  for (const session of expiredSessions ?? []) {
    if (session.owner_id) {
      const { data: fileItems } = await serviceClient
        .from("items")
        .select("size_bytes")
        .eq("session_id", session.id)
        .eq("kind", "file")
        .is("deleted_at", null);

      const totalBytes = (fileItems ?? []).reduce(
        (sum, item) => sum + (item.size_bytes ?? 0),
        0,
      );
      if (totalBytes > 0) {
        await serviceClient.rpc("increment_storage_used", {
          p_user_id: session.owner_id,
          p_delta: -totalBytes,
        });
      }
    }

    await serviceClient
      .from("items")
      .update({ deleted_at: now })
      .eq("session_id", session.id)
      .is("deleted_at", null);
    await serviceClient
      .from("sessions")
      .update({ deleted_at: now })
      .eq("id", session.id);
    expiredCount++;
  }

  // --- Phase 2: hard-delete sessions soft-deleted for longer than the buffer ---
  // Covers BOTH sessions expired in phase 1 above (on a previous run --
  // not this same run, since they were just soft-deleted moments ago and
  // won't be old enough yet) AND sessions soft-deleted via the manual
  // DELETE endpoint. Quota was already released at soft-delete time for
  // both paths, so this phase must NOT touch quota again -- doing so
  // would double-decrement it.
  const bufferCutoff = new Date(
    Date.now() - HARD_DELETE_BUFFER_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { data: staleSessions } = await serviceClient
    .from("sessions")
    .select("id")
    .not("deleted_at", "is", null)
    .lt("deleted_at", bufferCutoff)
    .limit(BATCH_LIMIT);

  let hardDeletedCount = 0;
  let r2DeleteErrors = 0;
  for (const session of staleSessions ?? []) {
    const { data: fileItems } = await serviceClient
      .from("items")
      .select("id, storage_key")
      .eq("session_id", session.id)
      .eq("kind", "file")
      .not("storage_key", "is", null);

    // Best-effort, one at a time -- an R2 failure on one object shouldn't
    // abort cleanup for the rest of this session's files or the session
    // row itself. A leftover orphaned R2 object is a minor cost leak, not
    // a correctness problem; a stuck DB row blocking all future cleanup
    // runs would be worse.
    for (const item of fileItems ?? []) {
      try {
        await deleteObject(item.storage_key!);
      } catch (err) {
        r2DeleteErrors++;
        console.error(
          `[cleanup-cron] Failed to delete R2 object for item ${item.id}:`,
          err,
        );
      }
    }

    await serviceClient.from("items").delete().eq("session_id", session.id);
    await serviceClient.from("sessions").delete().eq("id", session.id);
    hardDeletedCount++;
  }

  return NextResponse.json({
    expired: expiredCount,
    hardDeleted: hardDeletedCount,
    r2DeleteErrors,
  });
}
