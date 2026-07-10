"use client";

import { Button } from "@/components/ui/button";

// One-time items are consumed atomically by the download endpoint itself
// (Phase 2) -- this confirm() is purely a courtesy so the person doesn't
// accidentally burn a single-use link with an unintended click, not a
// security measure. The endpoint enforces the real one-time guarantee
// regardless of what this button does or doesn't ask first.
export function DownloadButton({
  itemId,
  oneTime,
}: {
  itemId: string;
  oneTime: boolean;
}) {
  function handleClick() {
    if (
      oneTime &&
      !window.confirm(
        "This is a one-time download. After this, the link won't work again. Continue?",
      )
    ) {
      return;
    }
    window.location.href = `/api/items/${itemId}/download`;
  }

  return (
    <Button size="sm" onClick={handleClick}>
      {oneTime ? "Download (one-time)" : "Download"}
    </Button>
  );
}
