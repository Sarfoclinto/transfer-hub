import Link from "next/link";
import { getVerifiedUser } from "@/lib/supabase/server";
import { logout } from "@/app/(auth)/login/actions";
import { Button } from "@/components/ui/button";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getVerifiedUser();

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
            {user ? (
              <form action={logout}>
                <Button type="submit" variant="ghost" size="sm">
                  Log out
                </Button>
              </form>
            ) : (
              <Button render={<Link href="/login" />} variant="ghost" size="sm">
                Log in
              </Button>
            )}
          </nav>
        </div>
      </header>
      <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        {children}
      </div>
    </div>
  );
}
