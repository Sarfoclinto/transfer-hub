import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient, getVerifiedUser } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { verifySessionOwnership } from "@/lib/auth/owner-token";
import { isUploadAllowed } from "@/lib/storage/mime-policy";
import { checkQuota } from "@/lib/storage/quota";
import { checkGuestItemRateLimit } from "@/lib/rate-limit";
import {
  buildStorageKey,
  getPresignedUploadUrl,
  getContentDisposition,
} from "@/lib/storage/r2-client";
import { requestUploadSchema } from "@/lib/validation/schemas";
import { logger } from "@/lib/logger";

export async function POST(request: Request) {
  const rawBody = await request.json().catch(() => ({}));
  const parsed = requestUploadSchema.safeParse(rawBody);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { session_id, filename, mime_type, size_bytes, one_time } = parsed.data;

  // Reading the session row here needs the service-role client, not the
  // regular anon-key one: a guest session is (by design) private and has
  // no owner_id, so it fails every RLS SELECT policy regardless of who's
  // asking -- there is no RLS-native way to check "does this caller hold
  // the right owner_token" because Postgres has no concept of that token.
  // This is exactly the legitimate, narrow use case service-role.ts exists
  // for (Phase 3) -- verify ownership in app code, then act on the result.
  const serviceClient = createServiceRoleClient();
  const { data: session, error: sessionError } = await serviceClient
    .from("sessions")
    .select("id, owner_id, owner_token_hash, deleted_at, expires_at")
    .eq("id", session_id)
    .maybeSingle();

  if (sessionError || !session || session.deleted_at) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }
  if (session.expires_at && new Date(session.expires_at) < new Date()) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  const user = await getVerifiedUser();
  const isGuestSession = session.owner_id === null;

  if (!verifySessionOwnership(session, user?.sub ?? null, request)) {
    return NextResponse.json(
      { error: "Not authorized for this session." },
      { status: 403 },
    );
  }

  if (isGuestSession) {
    const rateLimitCheck = await checkGuestItemRateLimit(request);
    if (!rateLimitCheck.allowed) {
      return NextResponse.json(
        { error: rateLimitCheck.reason },
        { status: 429 },
      );
    }
  }

  const policyCheck = isUploadAllowed(filename, size_bytes, isGuestSession);
  if (!policyCheck.allowed) {
    return NextResponse.json({ error: policyCheck.reason }, { status: 400 });
  }

  // Quota only applies to authenticated sessions -- guests have no durable
  // identity to track a running total against (Phase 3), just the per-file
  // size caps already checked above.
  if (!isGuestSession && session.owner_id) {
    const { data: profile } = await serviceClient
      .from("profiles")
      .select("storage_used_bytes")
      .eq("id", session.owner_id)
      .maybeSingle();

    const quotaCheck = checkQuota(profile?.storage_used_bytes ?? 0, size_bytes);
    if (!quotaCheck.allowed) {
      return NextResponse.json({ error: quotaCheck.reason }, { status: 400 });
    }
  }

  const itemId = randomUUID();
  const storageKey = buildStorageKey(session_id, itemId, filename);

  // Insert via the regular anon-key client, not service-role: the items
  // INSERT policy is `with check (true)` for everyone (Phase 3), and we're
  // not chaining .select() -- same fix as the sessions-creation bug, applied
  // here from the start instead of hitting it twice.
  const supabase = await createClient();
  const { error: insertError } = await supabase.from("items").insert({
    id: itemId,
    session_id,
    kind: "file",
    title: filename,
    original_filename: filename,
    mime_type,
    size_bytes,
    storage_key: storageKey,
    status: "pending",
    one_time,
  });

  if (insertError) {
    logger.error("request-upload: item insert failed", {
      error: insertError.message,
    });
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const uploadUrl = await getPresignedUploadUrl(storageKey, mime_type, 3600);

  return NextResponse.json({
    item_id: itemId,
    upload_url: uploadUrl,
    storage_key: storageKey,
    // The PUT to upload_url must include this exact Content-Disposition
    // header, since it's part of what was signed -- otherwise R2 rejects
    // the request with a signature mismatch (see CORS_SETUP.md).
    content_disposition: getContentDisposition(mime_type),
  });
}
