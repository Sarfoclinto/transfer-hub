import Link from "next/link";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import {
  PublicGallery,
  type PublicSessionSummary,
} from "@/components/public/public-gallery";
import {
  getSessionDisplayTitle,
  type ItemForDisplayTitle,
} from "@/lib/display-title";

const GALLERY_LIMIT = 30;

export default async function HomePage() {
  const supabase = await createClient();

  // Deliberately the plain anon-key client, not service-role: this is a
  // genuine public read, and RLS's "public or unlisted... viewable" policy
  // (Phase 3) already covers exactly this case -- visibility = 'public',
  // not deleted, not expired -- for anyone, logged in or not. No special
  // casing needed here.
  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, title, created_at")
    .eq("visibility", "public")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(GALLERY_LIMIT);

  const sessionIds = (sessions ?? []).map((s) => s.id);

  // Same reasoning as the dashboard: a separate query grouped in JS,
  // rather than a PostgREST embedded select, since types/database.ts's
  // hand-authored Relationships are empty arrays.
  const { data: items } =
    sessionIds.length > 0
      ? await supabase
          .from("items")
          .select("session_id, kind, title, original_filename")
          .in("session_id", sessionIds)
          .order("created_at", { ascending: true })
      : { data: [] };

  type GalleryItem = {
    session_id: string;
    kind: string;
    title: string | null;
    original_filename: string | null;
  };
  const itemsBySession = new Map<string, GalleryItem[]>();
  for (const item of (items ?? []) as GalleryItem[]) {
    const list = itemsBySession.get(item.session_id) ?? [];
    list.push(item);
    itemsBySession.set(item.session_id, list);
  }

  function summarizeKind(
    sessionItems: { kind: string }[],
  ): PublicSessionSummary["kind"] {
    if (sessionItems.length === 0) return "empty";
    const kinds = new Set(sessionItems.map((i) => i.kind));
    if (kinds.size > 1) return "mixed";
    return kinds.has("text") ? "text" : "file";
  }

  const gallerySessions: PublicSessionSummary[] = (sessions ?? []).map((s) => {
    const sessionItems = itemsBySession.get(s.id) ?? [];
    return {
      id: s.id,
      displayTitle: getSessionDisplayTitle(
        s.title,
        sessionItems as ItemForDisplayTitle[],
      ),
      created_at: s.created_at,
      kind: summarizeKind(sessionItems),
      itemCount: sessionItems.length,
    };
  });

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
        <Link href="/upload">
          <Button size="lg">
            <Upload className="size-4" />
            Start a transfer
          </Button>
        </Link>
      </div>

      <div className="flex w-full max-w-2xl flex-col gap-4 border-t border-border pt-8">
        <h2 className="text-center text-lg font-semibold tracking-tight">
          Public uploads
        </h2>
        <PublicGallery sessions={gallerySessions} />
      </div>
    </div>
  );
}
