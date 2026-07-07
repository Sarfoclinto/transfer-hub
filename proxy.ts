// Next.js 16 renamed middleware.ts -> proxy.ts (network boundary, Node.js
// runtime by default instead of Edge).
//
// Three-layer auth model (current Supabase + Next.js guidance, and the
// reason for this split rather than gating everything here):
//   1. proxy.ts (this file)  -- refresh the session cookie, redirect away
//      from /dashboard for UX if there's obviously no session. Convenience
//      only -- cookies can be spoofed, so this is NOT a security boundary.
//   2. Server Components/Actions -- re-verify with supabase.auth.getClaims()
//      before trusting anything (see lib/supabase/server.ts). This is the
//      real gate. Never assume proxy.ts already checked.
//   3. RLS (Postgres) -- the last line of defense regardless of what the
//      application code does or forgets to do (see Phase 3 / migrations).
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PREFIXES = ["/dashboard"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refreshes the token if expired -- getClaims() is the current
  // recommendation (validates the JWT signature every call).
  const { data } = await supabase.auth.getClaims();
  const isAuthed = Boolean(data?.claims);

  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    request.nextUrl.pathname.startsWith(prefix),
  );

  if (isProtected && !isAuthed) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)",
  ],
};
