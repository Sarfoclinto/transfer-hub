"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { QrCode as QrCodeIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SessionFilters } from "./session-filters";
import { CopyLinkButton } from "./copy-link-button";
import { DeleteSessionButton } from "./delete-session-button";
import { QrCode } from "@/components/qr-code";

export type SessionKind = "text" | "file" | "mixed" | "empty";

export type SessionSummary = {
  id: string;
  title: string | null;
  visibility: string;
  created_at: string;
  expires_at: string | null;
  kind: SessionKind;
  itemCount: number;
};

function kindLabel(summary: SessionSummary): string {
  if (summary.kind === "empty") return "empty";
  if (summary.kind === "mixed") return `mixed · ${summary.itemCount} items`;
  return summary.itemCount === 1
    ? summary.kind
    : `${summary.kind} · ${summary.itemCount} items`;
}

// Own component (rather than inlined in the .map() below) specifically so
// each card's "show QR" toggle is independent state -- a single boolean on
// the parent would show/hide QR codes for every card at once.
function SessionCard({ session }: { session: SessionSummary }) {
  const [showQr, setShowQr] = useState(false);
  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/s/${session.id}`
      : "";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="truncate">
          {session.title ?? "Untitled session"}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex flex-col gap-0.5 text-sm text-muted-foreground">
            <span>
              {kindLabel(session)} · {session.visibility}
            </span>
            <span>
              Created {new Date(session.created_at).toLocaleDateString()}
              {session.expires_at &&
                ` · expires ${new Date(session.expires_at).toLocaleDateString()}`}
            </span>
          </div>
          <div className="flex shrink-0 gap-2">
            <CopyLinkButton sessionId={session.id} />
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowQr((v) => !v)}
            >
              <QrCodeIcon className="size-4" />
            </Button>
            <Link
              href={`/s/${session.id}`}
              className="inline-flex h-8 items-center rounded-md border border-input px-3 text-sm hover:bg-accent hover:text-accent-foreground"
            >
              View
            </Link>
            <DeleteSessionButton sessionId={session.id} />
          </div>
        </div>
        {showQr && (
          <div className="flex justify-center">
            <QrCode value={shareUrl} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Client Component: needs to own filter/search state and re-render the
// list as the person types/selects, which a Server Component can't do.
// The data itself (SessionSummary[]) is computed server-side in
// dashboard/page.tsx and passed down as a plain, serializable array --
// deliberately NOT the Map used to compute it, since Maps don't cross the
// client-props serialization boundary.
export function SessionList({ sessions }: { sessions: SessionSummary[] }) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const filtered = useMemo(() => {
    return sessions.filter((s) => {
      const matchesType = typeFilter === "all" || s.kind === typeFilter;
      const matchesQuery =
        query.trim() === "" ||
        (s.title ?? "untitled session")
          .toLowerCase()
          .includes(query.trim().toLowerCase());
      return matchesType && matchesQuery;
    });
  }, [sessions, query, typeFilter]);

  return (
    <div className="flex flex-col gap-3">
      <SessionFilters
        query={query}
        onQueryChange={setQuery}
        typeFilter={typeFilter}
        onTypeFilterChange={setTypeFilter}
      />

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            No sessions match your search.
          </CardContent>
        </Card>
      ) : (
        filtered.map((session) => (
          <SessionCard key={session.id} session={session} />
        ))
      )}
    </div>
  );
}
