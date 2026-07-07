// DELIBERATELY ISOLATED IN THIS FILE -- this is the only client that bypasses
// RLS. Per Phase 3, its only legitimate use is the guest owner-token write
// path (verify token hash in app code, then use this client to perform the
// write). Every call site importing this file should be traceable to that
// pattern -- do not import it for convenience elsewhere.
//
// Never import this in a file that's reachable from a Client Component --
// the service role key must never end up in a browser bundle. It has no
// NEXT_PUBLIC_ prefix specifically so Next.js won't inline it client-side,
// but that's a safety net, not a substitute for being careful about imports.
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export function createServiceRoleClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
