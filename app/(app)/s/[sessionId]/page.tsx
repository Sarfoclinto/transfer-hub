import { cookies } from "next/headers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient, getVerifiedUser } from "@/lib/supabase/server";
import { MarkdownPreview } from "@/components/preview/markdown-preview";
import { CodePreview } from "@/components/preview/code-preview";
import { TextItemActions } from "@/components/preview/text-item-actions";
import { OwnerOnly } from "@/components/preview/owner-only";
import { DeleteSessionButton } from "@/components/dashboard/delete-session-button";
import { DownloadButton } from "@/components/preview/download-button";
import { PasswordGate } from "@/components/preview/password-gate";
import { ImagePreview } from "@/components/preview/image-preview";
import { PdfPreview } from "@/components/preview/pdf-preview";
import { AutoDownload } from "@/components/preview/auto-download";
import { verifyUnlockToken, unlockCookieName } from "@/lib/auth/session-unlock";
import { formatBytes } from "@/lib/storage/quota";
import { isPreviewableMime } from "@/lib/storage/r2-client";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const supabase = await createClient();

  // Deliberately the regular anon-key client, not service-role: this is a
  // real page view, and RLS is exactly what should decide whether this
  // session is visible here -- public/unlisted sessions pass the "public
  // or unlisted... " SELECT policy naturally (Phase 3), an authenticated
  // owner's private session passes via auth.uid(). A guest's PRIVATE
  // session (the opt-in rare case) genuinely can't be viewed this way --
  // that's correct, not a bug; same-device management for that case would
  // need a client-side fetch using the localStorage token, which is a
  // known gap deferred past this milestone's scope (single-file guest
  // upload/download for the common, unlisted case).
  const { data: session } = await supabase
    .from("sessions")
    .select("id, title, visibility, owner_id, password_hash")
    .eq("id", sessionId)
    .maybeSingle();

  if (!session) {
    return (
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Not found</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            This link doesn&apos;t exist, has expired, or isn&apos;t visible to
            you. If it&apos;s a private session, you&apos;ll need to open it
            from the same device it was created on.
          </CardContent>
        </Card>
      </div>
    );
  }

  const user = await getVerifiedUser();
  const isOwnerAuthed = user?.sub === session.owner_id;

  // Password gate: owners always bypass it (they set the password or are
  // the authenticated owner either way). Everyone else needs a valid
  // unlock cookie for THIS session -- checked here, and independently
  // re-checked in the download endpoint itself, since a page-level gate
  // alone wouldn't stop someone hitting the download URL directly.
  if (session.password_hash && !isOwnerAuthed) {
    const cookieStore = await cookies();
    const unlockCookie = cookieStore.get(unlockCookieName(sessionId))?.value;
    if (!verifyUnlockToken(sessionId, unlockCookie)) {
      return (
        <div className="flex flex-col gap-6">
          <PasswordGate sessionId={sessionId} />
        </div>
      );
    }
  }

  const { data: items } = await supabase
    .from("items")
    .select(
      "id, kind, title, original_filename, mime_type, size_bytes, text_content, text_language, one_time",
    )
    .eq("session_id", sessionId)
    .order("order_index", { ascending: true });

  // Auto-download only for the unambiguous single-file case: a mixed or
  // multi-item session has a real choice to make (auto-picking one would
  // be arbitrary), a text item is better viewed/copied than force-
  // downloaded, and a one-time item must stay an explicit, deliberate
  // click -- see AutoDownload's own comment for why this is a client-side
  // trigger rather than a server redirect in the first place.
  const soleItem = items && items.length === 1 ? items[0] : null;
  const autoDownloadItemId =
    soleItem && soleItem.kind === "file" && !soleItem.one_time
      ? soleItem.id
      : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">
          {session.title ?? "Shared transfer"}
        </h1>
        <OwnerOnly sessionId={sessionId} isOwnerAuthed={isOwnerAuthed}>
          <DeleteSessionButton sessionId={sessionId} redirectTo="/" />
        </OwnerOnly>
      </div>

      {autoDownloadItemId && <AutoDownload itemId={autoDownloadItemId} />}

      {!items || items.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Nothing here yet</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            This upload may still be processing -- try refreshing in a moment.
          </CardContent>
        </Card>
      ) : (
        items.map((item) => (
          <Card key={item.id}>
            <CardHeader>
              <CardTitle className="truncate">
                {item.original_filename ?? item.title ?? "Untitled"}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {item.kind === "text" && item.text_content != null && (
                <TextItemActions
                  itemId={item.id}
                  sessionId={sessionId}
                  content={item.text_content}
                  isOwnerAuthed={isOwnerAuthed}
                >
                  <div className="max-h-96 overflow-auto">
                    {item.text_language === "markdown" ? (
                      <MarkdownPreview content={item.text_content} />
                    ) : (
                      <CodePreview
                        content={item.text_content}
                        language={item.text_language}
                      />
                    )}
                  </div>
                </TextItemActions>
              )}
              {/* Video/audio are also "previewable" per isPreviewableMime
                  (Phase 2 mentions <video>/<audio> as simple additions),
                  but this slice only builds image/PDF per its own scope --
                  those items still get a working Download button below,
                  just no inline player yet. */}
              {item.kind === "file" &&
                !item.one_time &&
                item.mime_type &&
                isPreviewableMime(item.mime_type) &&
                (item.mime_type.startsWith("image/") ? (
                  <ImagePreview
                    itemId={item.id}
                    alt={item.original_filename ?? item.title ?? "Preview"}
                  />
                ) : item.mime_type === "application/pdf" ? (
                  <PdfPreview itemId={item.id} />
                ) : null)}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {item.kind === "text"
                    ? (item.text_language ?? "text")
                    : item.mime_type}
                  {item.size_bytes != null &&
                    ` · ${formatBytes(item.size_bytes)}`}
                </span>
                <DownloadButton itemId={item.id} oneTime={item.one_time} />
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
