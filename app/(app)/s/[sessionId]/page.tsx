import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient, getVerifiedUser } from "@/lib/supabase/server";
import { MarkdownPreview } from "@/components/preview/markdown-preview";
import { CodePreview } from "@/components/preview/code-preview";
import { TextItemActions } from "@/components/preview/text-item-actions";

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
    .select("id, title, visibility, owner_id")
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

  const { data: items } = await supabase
    .from("items")
    .select(
      "id, kind, title, original_filename, mime_type, size_bytes, text_content, text_language",
    )
    .eq("session_id", sessionId)
    .order("order_index", { ascending: true });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {session.title ?? "Shared transfer"}
        </h1>
      </div>

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
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {item.kind === "text"
                    ? (item.text_language ?? "text")
                    : item.mime_type}
                  {item.size_bytes != null &&
                    ` · ${formatBytes(item.size_bytes)}`}
                </span>
                <Button asChild size="sm">
                  <a href={`/api/items/${item.id}/download`}>Download</a>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
