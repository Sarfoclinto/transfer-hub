"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// Works in two contexts: the dashboard (ownership guaranteed by the query
// that listed the session in the first place -- no token needed, the auth
// cookie carries it) and the session page (ownership unproven until
// verified server-side, so we opportunistically send whatever local token
// exists; the real check is always server-side in the DELETE handler,
// this is just "send what we have").
export function DeleteSessionButton({
  sessionId,
  redirectTo,
}: {
  sessionId: string;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    if (!window.confirm("Delete this session? This can't be undone.")) return;
    setIsDeleting(true);

    const ownerToken = localStorage.getItem(`ownerToken:${sessionId}`);
    const res = await fetch(`/api/sessions/${sessionId}`, {
      method: "DELETE",
      headers: ownerToken ? { "X-Owner-Token": ownerToken } : {},
    });

    setIsDeleting(false);
    if (!res.ok) {
      window.alert("Could not delete this session. Please try again.");
      return;
    }

    if (redirectTo) {
      router.push(redirectTo);
    } else {
      // Re-runs the Server Component fetch so the list reflects the
      // deletion -- avoids hand-maintaining removal-from-array logic here.
      router.refresh();
    }
  }

  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={handleDelete}
      disabled={isDeleting}
    >
      <Trash2 className="size-4" />
      {isDeleting ? "Deleting..." : "Delete"}
    </Button>
  );
}
