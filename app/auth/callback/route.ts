import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Hit after Google OAuth or email confirmation redirects back to us.
// Exchanges the auth code in the URL for a real session (sets cookies via
// the server client), then sends the person where they were headed.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent("Could not complete sign-in. Please try again.")}`
  );
}
