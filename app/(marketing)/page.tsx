import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dropzone } from "@/components/upload/dropzone";

export default function MarketingHomePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-12 text-center">
      <div className="flex flex-col items-center gap-4">
        <h1 className="max-w-xl text-4xl font-semibold tracking-tight sm:text-5xl">
          Get anything from one device to another, instantly.
        </h1>
        <p className="max-w-md text-muted-foreground">
          Upload from one device, open the link on any other. No account,
          messaging apps, or USB drives required.
        </p>
      </div>

      <Dropzone />

      <Button asChild variant="ghost" size="sm">
        <Link href="/dashboard">Have an account? Go to your dashboard</Link>
      </Button>
    </main>
  );
}
