import Link from "next/link";

// This layout will grow a real nav (auth state, upload button, etc.) once
// Supabase Auth is wired in slice 3 of Milestone 1. For now it's just the
// structural shell so route groups are in place from day one.
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <Link href="/" className="font-semibold tracking-tight">
            Transfer Hub
          </Link>
          <nav className="flex items-center gap-4 text-sm text-muted-foreground">
            <Link href="/dashboard" className="hover:text-foreground">
              Dashboard
            </Link>
          </nav>
        </div>
      </header>
      <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        {children}
      </div>
    </div>
  );
}
