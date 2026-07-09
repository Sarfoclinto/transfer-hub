import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyLinkButton } from "./copy-link-button";

type SessionRow = {
  id: string;
  title: string | null;
  visibility: string;
  created_at: string;
  expires_at: string | null;
};

function summarizeKinds(items: { kind: string }[]): string {
  if (items.length === 0) return "empty";
  const kinds = new Set(items.map((i) => i.kind));
  if (kinds.size > 1) return `mixed · ${items.length} items`;
  const kind = [...kinds][0];
  return items.length === 1 ? kind : `${kind} · ${items.length} items`;
}

// Server Component deliberately -- itemsBySession is a Map built in the
// page's Server Component; keeping this a Server Component too means it
// never has to cross the client-serialization boundary (Maps aren't
// directly serializable as Client Component props). Only the copy button
// below needs actual client interactivity.
export function SessionList({
  sessions,
  itemsBySession,
}: {
  sessions: SessionRow[];
  itemsBySession: Map<string, { kind: string }[]>;
}) {
  return (
    <div className="flex flex-col gap-3">
      {sessions.map((session) => {
        const items = itemsBySession.get(session.id) ?? [];
        return (
          <Card key={session.id}>
            <CardHeader>
              <CardTitle className="truncate">
                {session.title ?? "Untitled session"}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5 text-sm text-muted-foreground">
                <span>
                  {summarizeKinds(items)} · {session.visibility}
                </span>
                <span>
                  Created {new Date(session.created_at).toLocaleDateString()}
                  {session.expires_at &&
                    ` · expires ${new Date(session.expires_at).toLocaleDateString()}`}
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
        );
      })}
    </div>
  );
}
