import { redirect } from "next/navigation";
import { getVerifiedUser } from "@/lib/supabase/server";

// This is the REAL gate for the dashboard -- proxy.ts already redirected
// unauthenticated requests away as a UX convenience, but per the three-layer
// model this check is independent and does not trust that proxy.ts ran or
// ran correctly. getVerifiedUser() calls getClaims(), which verifies the JWT
// signature on every call rather than trusting a cookie value.
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getVerifiedUser();

  if (!user) {
    redirect("/login?next=/dashboard");
  }

  return <>{children}</>;
}
