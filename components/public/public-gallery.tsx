import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyLinkButton } from "@/components/dashboard/copy-link-button";

export type PublicSessionSummary = {
  id: string;
  title: string | null;
  created_at: string;
  kind: "text" | "file" | "mixed" | "empty";
  itemCount: number;
};

function kindLabel(summary: PublicSessionSummary): string {
  if (summary.kind === "empty") return "empty";
  if (summary.kind === "mixed") return `mixed · ${summary.itemCount} items`;
  return summary.itemCount === 1
    ? summary.kind
    : `${summary.kind} · ${summary.itemCount} items`;
}

// Server Component -- no owner-only actions here (no Delete; a visitor
// browsing what's public didn't create these), so unlike the dashboard's
// session-list.tsx this doesn't need any client-side state at all. The one
// interactive piece (Copy Link) is its own small client island, same
// component the dashboard already uses.
export function PublicGallery({
  sessions,
}: {
  sessions: PublicSessionSummary[];
}) {
  if (sessions.length === 0) {
    return (
      <p className="text-center text-sm text-muted-foreground">
        No public uploads yet -- be the first.
      </p>
    );
  }

  return (
    <div className="flex w-full flex-col gap-3">
      {sessions.map((session) => (
        <Card key={session.id}>
          <CardHeader>
            <CardTitle className="truncate">
              {session.title ?? "Untitled session"}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-0.5 text-sm text-muted-foreground">
              <span>{kindLabel(session)}</span>
              <span>
                Shared {new Date(session.created_at).toLocaleDateString()}
              </span>
            </div>
            <div className="flex shrink-0 gap-2">
              <CopyLinkButton sessionId={session.id} />
              <Link
                href={`/s/${session.id}`}
                className="inline-flex h-8 items-center rounded-md border border-input px-3 text-sm hover:bg-accent hover:text-accent-foreground"
              >
                View
              </Link>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
