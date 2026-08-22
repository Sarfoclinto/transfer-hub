"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Generic on purpose -- session rename (PATCH /api/sessions/[id]) and item
// rename (PATCH /api/items/[id]) both accept the exact same {title} shape
// and both need the same owner-token-header-if-present pattern, so one
// component covers both rather than two near-identical copies.
export function RenameControl({
  sessionId,
  patchUrl,
  currentTitle,
  placeholder,
}: {
  sessionId: string; // for the localStorage owner-token lookup, not necessarily the thing being renamed
  patchUrl: string;
  currentTitle: string | null;
  placeholder: string;
}) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(currentTitle ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    const ownerToken = localStorage.getItem(`ownerToken:${sessionId}`);

    const res = await fetch(patchUrl, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(ownerToken ? { "X-Owner-Token": ownerToken } : {}),
      },
      body: JSON.stringify({ title: value }),
    });

    setIsSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not rename.");
      return;
    }
    setIsEditing(false);
    // Re-runs the Server Component fetch so the new (or cleared, reverting
    // to the auto-generated label) title shows immediately.
    router.refresh();
  }

  if (isEditing) {
    return (
      <div className="flex items-center gap-1.5">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="h-8 text-sm"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") {
              setValue(currentTitle ?? "");
              setIsEditing(false);
            }
          }}
        />
        <Button
          size="sm"
          variant="ghost"
          onClick={handleSave}
          disabled={isSaving}
        >
          <Check className="size-4" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setValue(currentTitle ?? "");
            setError(null);
            setIsEditing(false);
          }}
        >
          <X className="size-4" />
        </Button>
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
    );
  }

  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={() => setIsEditing(true)}
      aria-label="Rename"
    >
      <Pencil className="size-4" />
    </Button>
  );
}
