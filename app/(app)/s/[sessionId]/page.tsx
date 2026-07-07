import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Session: {sessionId}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          This is a placeholder. Once Milestone 2 lands, this page will fetch
          the session&apos;s items from Supabase (respecting the RLS policies
          from Phase 3) and render previews/downloads for each one.
        </CardContent>
      </Card>
    </div>
  );
}
