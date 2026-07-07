import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Your sessions</h1>
        <p className="text-sm text-muted-foreground">
          Uploaded text and files you own will show up here once auth and
          storage are wired in (Milestones 3–4).
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
