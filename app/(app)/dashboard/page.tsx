import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getVerifiedUser } from "@/lib/supabase/server";

export default async function DashboardPage() {
  // Layout above already redirects if there's no user, so this is safe --
  // but we still call getVerifiedUser() again rather than trusting a prop
  // passed down, since Server Components don't share request state that way.
  const user = await getVerifiedUser();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Your sessions</h1>
        <p className="text-sm text-muted-foreground">
          Signed in as {user?.email}. Uploaded sessions will show up here once
          storage is wired in (Milestone 2/4).
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>No sessions yet</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          This is a placeholder empty state. The real dropzone / upload flow
          lands in Milestone 2.
        </CardContent>
      </Card>
    </div>
  );
}
