import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient, getVerifiedUser } from "@/lib/supabase/server";
import { AUTHED_STORAGE_QUOTA_BYTES, formatBytes } from "@/lib/storage/quota";
import {
  SessionList,
  type SessionSummary,
  type SessionKind,
} from "@/components/dashboard/session-list";

export default async function DashboardPage() {
  // Layout above already redirects if there's no user, so this is safe --
  // but we still call getVerifiedUser() again rather than trusting a prop
  // passed down, since Server Components don't share request state that way.
  const user = await getVerifiedUser();
  const supabase = await createClient();

  const [{ data: profile }, { data: sessions }] = await Promise.all([
    supabase
      .from("profiles")
      .select("storage_used_bytes")
      .eq("id", user!.sub)
      .maybeSingle(),
    supabase
      .from("sessions")
      .select("id, title, visibility, created_at, expires_at")
      .eq("owner_id", user!.sub)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
  ]);

  const sessionIds = (sessions ?? []).map((s) => s.id);

  // Separate query rather than a PostgREST embedded select (`sessions(...,
  // items(kind))`) -- our hand-authored Database type has empty
  // Relationships arrays (see types/database.ts), so an embedded select
  // would work at runtime but not be meaningfully typed. Two plain queries,
  // grouped in JS below, keeps everything type-safe.
  const { data: items } =
    sessionIds.length > 0
      ? await supabase
          .from("items")
          .select("session_id, kind")
          .in("session_id", sessionIds)
      : { data: [] };

  const itemsBySession = new Map<string, { kind: string }[]>();
  for (const item of items ?? []) {
    const list = itemsBySession.get(item.session_id) ?? [];
    list.push(item);
    itemsBySession.set(item.session_id, list);
  }

  // Reduced to a plain, serializable array here -- the Map above is a
  // server-only convenience for grouping and never crosses into
  // SessionList, which is a Client Component (owns filter/search state).
  function summarizeKind(sessionItems: { kind: string }[]): SessionKind {
    if (sessionItems.length === 0) return "empty";
    const kinds = new Set(sessionItems.map((i) => i.kind));
    if (kinds.size > 1) return "mixed";
    return kinds.has("text") ? "text" : "file";
  }

  const sessionSummaries: SessionSummary[] = (sessions ?? []).map((s) => {
    const sessionItems = itemsBySession.get(s.id) ?? [];
    return {
      id: s.id,
      title: s.title,
      visibility: s.visibility,
      created_at: s.created_at,
      expires_at: s.expires_at,
      kind: summarizeKind(sessionItems),
      itemCount: sessionItems.length,
    };
  });

  const usedBytes = profile?.storage_used_bytes ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Your sessions</h1>
        <p className="text-sm text-muted-foreground">
          {formatBytes(usedBytes)} of {formatBytes(AUTHED_STORAGE_QUOTA_BYTES)}{" "}
          used
        </p>
      </div>

      {!sessions || sessions.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No sessions yet</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Sessions you create while signed in will show up here.
          </CardContent>
        </Card>
      ) : (
        <SessionList sessions={sessionSummaries} />
      )}
    </div>
  );
}
