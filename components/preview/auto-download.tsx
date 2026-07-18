"use client";

import { useEffect } from "react";
import { Loader2 } from "lucide-react";

// Client-side triggered on purpose, NOT a server-side redirect on the
// session page itself -- messaging apps (WhatsApp, Telegram, Slack, etc.)
// commonly auto-fetch a shared link server-side to generate a link
// preview, before any human actually taps it. A server-side redirect
// straight to the download endpoint would fire on that preview-fetch too,
// which for a one-time item would silently burn its single use before the
// real recipient ever saw the message. Preview-crawlers don't execute
// JavaScript, so this only ever fires for an actual person's browser
// loading the page -- the page itself still renders completely normally
// either way, this is additive, not a replacement for the real content.
export function AutoDownload({ itemId }: { itemId: string }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      window.location.href = `/api/items/${itemId}/download`;
    }, 600); // brief delay so it reads as intentional, not a jarring instant redirect
    return () => clearTimeout(timer);
  }, [itemId]);

  return (
    <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" />
      Starting your download...
    </p>
  );
}
