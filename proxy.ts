// Next.js 16 renamed middleware.ts -> proxy.ts (still runs at the network
// boundary, now on the Node.js runtime by default instead of Edge).
//
// IMPORTANT for Milestone 1 slice 3: do NOT put auth/session gating logic in
// here. Next.js's own guidance post-CVE-2025-29927 is that middleware/proxy-
// based auth checks can be bypassed under certain conditions, so real auth
// checks belong in Server Components -- e.g. a check at the top of
// app/(app)/dashboard/layout.tsx that redirects if there's no session, using
// the server-side Supabase client (lib/supabase/server.ts). This file should
// stay limited to lightweight, non-security-critical request-time concerns
// (rewrites, redirects for cosmetic routing, header injection) -- see Phase 3
// design note updated accordingly.
import { NextResponse, type NextRequest } from "next/server";

export function proxy(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
