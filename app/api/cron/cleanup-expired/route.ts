import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { deleteObject } from "@/lib/storage/r2-client";
import { logger } from "@/lib/logger";

// How long a session sits soft-deleted before its R2 objects and DB rows
// are actually removed. This buffer exists specifically so a wrongly-
// expired session (an expiry bug, a clock issue, whatever) is recoverable
// for a week rather than unrecoverably gone the moment it's flagged --
// see Phase 2's original reasoning for this design.
const HARD_DELETE_BUFFER_DAYS = 7;

// How long an item can sit at status='pending' before it's considered
// abandoned -- covers uploads that failed before confirm-upload ever ran
// (a dropped connection, a backgrounded tab, someone just closing the
// tab mid-upload). These were never visible or downloadable to anyone
// (RLS hides non-'ready' items from everyone except an authenticated
// owner, and the download endpoint refuses them outright regardless), so
// unlike expired sessions there's no recovery-window benefit to a soft-
// delete buffer here -- straight to hard-delete.
const STALE_PENDING_HOURS = 24;

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
    logger.warn(
      "cleanup-cron: CRON_SECRET not set, endpoint is unauthenticated",
      {
        route: "cron/cleanup-expired",
      },
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

  // --- Phase 0: reap items abandoned mid-upload (stuck at 'pending') ---
  const pendingCutoff = new Date(
    Date.now() - STALE_PENDING_HOURS * 60 * 60 * 1000,
  ).toISOString();
  const { data: stalePendingItems, error: stalePendingQueryError } =
    await serviceClient
      .from("items")
      .select("id, storage_key, kind")
      .eq("status", "pending")
      .lt("created_at", pendingCutoff)
      .limit(BATCH_LIMIT);

  if (stalePendingQueryError) {
    logger.error("cleanup-cron: phase 0 query failed", {
      error: stalePendingQueryError.message,
    });
  }

  let stalePendingCount = 0;
  for (const item of stalePendingItems ?? []) {
    // Best-effort, and NOT counted as an r2DeleteErrors-style failure if it
    // no-ops -- a failed/incomplete PUT normally never created an object at
    // this key at all (S3-compatible PUT is atomic: it either fully lands
    // or doesn't exist), so "nothing to delete" is the expected outcome
    // here, not an error worth logging every run.
    if (item.kind === "file" && item.storage_key) {
      try {
        await deleteObject(item.storage_key);
      } catch {
        // expected no-op in the common case, see comment above
      }
    }
    await serviceClient.from("items").delete().eq("id", item.id);
    stalePendingCount++;
  }

  // --- Phase 1: expire sessions past their expires_at, not yet soft-deleted ---
  // Soft-delete only here -- no R2 touch yet. This is also exactly what
  // the manual DELETE endpoint (M4S4) does at delete time, so an expired
  // session and a manually-deleted one converge to the same state and get
  // handled identically by phase 2 below, regardless of which path got
  // them there.
  const { data: expiredSessions, error: expiredQueryError } =
    await serviceClient
      .from("sessions")
      .select("id, owner_id")
      .is("deleted_at", null)
      .lt("expires_at", now)
      .limit(BATCH_LIMIT);

  if (expiredQueryError) {
    logger.error("cleanup-cron: phase 1 query failed", {
      error: expiredQueryError.message,
    });
  }

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
  const { data: staleSessions, error: staleQueryError } = await serviceClient
    .from("sessions")
    .select("id")
    .not("deleted_at", "is", null)
    .lt("deleted_at", bufferCutoff)
    .limit(BATCH_LIMIT);

  if (staleQueryError) {
    logger.error("cleanup-cron: phase 2 query failed", {
      error: staleQueryError.message,
    });
  }

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
        logger.error("cleanup-cron: failed to delete R2 object", {
          itemId: item.id,
          storageKey: item.storage_key,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    await serviceClient.from("items").delete().eq("session_id", session.id);
    await serviceClient.from("sessions").delete().eq("id", session.id);
    hardDeletedCount++;
  }

  logger.info("cleanup-cron: run complete", {
    stalePendingCleaned: stalePendingCount,
    expired: expiredCount,
    hardDeleted: hardDeletedCount,
    r2DeleteErrors,
  });

  return NextResponse.json({
    stalePendingCleaned: stalePendingCount,
    expired: expiredCount,
    hardDeleted: hardDeletedCount,
    r2DeleteErrors,
  });
}
