import Link from "next/link";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <div className="flex flex-1 flex-col items-center gap-10">
      <div className="flex flex-col items-center gap-4 text-center">
        <h1 className="max-w-xl text-4xl font-semibold tracking-tight sm:text-5xl">
          Get anything from one device to another, instantly.
        </h1>
        <p className="max-w-md text-muted-foreground">
          Upload from one device, open the link on any other. No account,
          messaging apps, or USB drives required.
        </p>
        <Button render={<Link href="/upload" />} size="lg">
          <Upload className="size-4" />
          Start a transfer
        </Button>
      </div>

      {/* TODO (next slice): real public gallery listing sessions with
          visibility = 'public', replacing this placeholder. */}
      <div className="w-full max-w-2xl border-t border-border pt-8 text-center text-sm text-muted-foreground">
        Public uploads will appear here.
      </div>
    </div>
  );
}
