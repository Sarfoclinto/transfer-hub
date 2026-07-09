"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Copy, Pencil, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

// No real subscription needed -- this token is set once at session creation
// and never changes for the lifetime of the page, so the "subscribe"
// callback is a no-op. useSyncExternalStore is still the right primitive
// here (over useState+useEffect) because it has an explicit, correct answer
// for "what do I render on the server, before this browser-only value can
// possibly be known" (getServerSnapshot), rather than a setState call
// racing the initial render.
function subscribe() {
  return () => {};
}

// Deliberately takes the server-rendered preview as `children` rather than
// re-rendering Markdown/code itself client-side -- keeps MarkdownPreview
// and CodePreview as zero-client-JS Server Components, and this wrapper
// only adds the interactive bits (copy, edit) around whatever was rendered.
export function TextItemActions({
  itemId,
  sessionId,
  content,
  isOwnerAuthed,
  children,
}: {
  itemId: string;
  sessionId: string;
  content: string;
  isOwnerAuthed: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(content);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Ownership for a guest session can only be known client-side (the
  // token lives in localStorage, never sent to or checked by the server
  // component that rendered this page) -- this is a UI convenience only.
  // The real check happens server-side in the PATCH handler via
  // verifySessionOwnership; showing the Edit button here doesn't grant
  // anything, it just avoids showing a button that would 403 for
  // everyone except the owner.
  const hasLocalOwnerToken = useSyncExternalStore(
    subscribe,
    () => Boolean(localStorage.getItem(`ownerToken:${sessionId}`)),
    () => false, // server snapshot -- localStorage doesn't exist server-side
  );
  const canEdit = isOwnerAuthed || hasLocalOwnerToken;

  async function handleCopy() {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    const ownerToken = localStorage.getItem(`ownerToken:${sessionId}`);

    const res = await fetch(`/api/items/${itemId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(ownerToken ? { "X-Owner-Token": ownerToken } : {}),
      },
      body: JSON.stringify({ text_content: editContent }),
    });

    setIsSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not save changes.");
      return;
    }
    setIsEditing(false);
    // Re-runs the Server Component fetch so the preview above reflects the
    // saved content -- avoids re-implementing Markdown/code rendering here.
    router.refresh();
  }

  if (isEditing) {
    return (
      <div className="flex flex-col gap-3">
        <textarea
          className="min-h-32 w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
        />
        {error && (
          <p className="flex items-center gap-1.5 text-sm text-destructive">
            <AlertCircle className="size-4" />
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isSaving || !editContent.trim()}
          >
            {isSaving ? "Saving..." : "Save"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setEditContent(content);
              setError(null);
              setIsEditing(false);
            }}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {children}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={handleCopy}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? "Copied" : "Copy"}
        </Button>
        {canEdit && (
          <Button size="sm" variant="ghost" onClick={() => setIsEditing(true)}>
            <Pencil className="size-4" />
            Edit
          </Button>
        )}
      </div>
    </div>
  );
}
