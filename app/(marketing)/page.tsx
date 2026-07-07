import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function MarketingHomePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <span className="text-sm font-medium tracking-wide text-accent uppercase">
        Milestone 1 · Scaffold
      </span>
      <h1 className="max-w-xl text-4xl font-semibold tracking-tight sm:text-5xl">
        Get anything from one device to another, instantly.
      </h1>
      <p className="max-w-md text-muted-foreground">
        Text, files, or both — upload from one device, open on any other.
        No accounts, messaging apps, or USB drives required.
      </p>
      <div className="flex gap-3">
        <Button asChild size="lg">
          <Link href="/dashboard">Open dashboard</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/s/demo">View a session (placeholder)</Link>
        </Button>
      </div>
    </main>
  );
}
