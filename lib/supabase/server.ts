import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";

// Used in Server Components, Server Actions, and Route Handlers.
// Anon key + RLS -- this client is subject to the same RLS policies as any
// other anon-key client, it's just cookie-aware so it knows who's logged in.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll was called from a Server Component -- safe to ignore
            // as long as proxy.ts is refreshing the session (it is).
          }
        },
      },
    },
  );
}

// Per current Supabase guidance: never trust getSession() in server code,
// it doesn't guarantee the token was revalidated. getClaims() verifies the
// JWT signature every time (locally, against cached JWKS for the default
// asymmetric-key setup) and is the correct way to gate a page or action.
export async function getVerifiedUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;
  return data.claims;
}
