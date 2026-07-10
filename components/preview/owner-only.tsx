"use client";

import { useSyncExternalStore } from "react";

// No real subscription needed -- this token is set once at session
// creation and never changes for the lifetime of the page. Same pattern
// as text-item-actions.tsx's ownership check; not consolidated into one
// shared hook yet since there are only two call sites so far -- worth
// factoring out if a third shows up.
function subscribe() {
  return () => {};
}

export function OwnerOnly({
  sessionId,
  isOwnerAuthed,
  children,
}: {
  sessionId: string;
  isOwnerAuthed: boolean;
  children: React.ReactNode;
}) {
  const hasLocalOwnerToken = useSyncExternalStore(
    subscribe,
    () => Boolean(localStorage.getItem(`ownerToken:${sessionId}`)),
    () => false, // server snapshot -- localStorage doesn't exist server-side
  );

  if (!isOwnerAuthed && !hasLocalOwnerToken) return null;
  return <>{children}</>;
}
