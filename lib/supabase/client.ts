import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

// Used in Client Components -- auth state, realtime subscriptions, etc.
// Uses the anon key, which is safe to expose (RLS is what actually protects
// data, not this key being secret).
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
