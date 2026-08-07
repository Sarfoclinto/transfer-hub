"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ListFilters } from "@/components/shared/list-filters";
import { CopyLinkButton } from "@/components/dashboard/copy-link-button";

export type PublicSessionSummary = {
  id: string;
  displayTitle: string;
  created_at: string;
  kind: "text" | "file" | "mixed" | "empty";
  itemCount: number;
};

function kindLabel(summary: PublicSessionSummary): string {
  if (summary.kind === "empty") return "empty";
  if (summary.kind === "mixed") return `mixed · ${summary.itemCount} items`;
  return summary.itemCount === 1
    ? summary.kind
    : `${summary.kind} · ${summary.itemCount} items`;
}

// Client Component (previously a plain Server Component) specifically to
// own filter/search state -- same reasoning as the dashboard's SessionList,
// and the same underlying problem prompted both: with every session
// auto-titled from its content rather than a real chosen name, a list of
// more than a few becomes hard to scan without search/filter. No owner-
// only actions here though (no Delete; a visitor didn't create these) --
// the one interactive piece beyond filtering is Copy Link, same small
// client island the dashboard already uses.
export function PublicGallery({
  sessions,
}: {
  sessions: PublicSessionSummary[];
}) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const filtered = useMemo(() => {
    return sessions.filter((s) => {
      const matchesType = typeFilter === "all" || s.kind === typeFilter;
      const matchesQuery =
        query.trim() === "" ||
        s.displayTitle.toLowerCase().includes(query.trim().toLowerCase());
      const createdDate = s.created_at.slice(0, 10);
      const matchesFrom = dateFrom === "" || createdDate >= dateFrom;
      const matchesTo = dateTo === "" || createdDate <= dateTo;
      return matchesType && matchesQuery && matchesFrom && matchesTo;
    });
  }, [sessions, query, typeFilter, dateFrom, dateTo]);

  if (sessions.length === 0) {
    return (
      <p className="text-center text-sm text-muted-foreground">
        No public uploads yet -- be the first.
      </p>
    );
  }

  return (
    <div className="flex w-full flex-col gap-3">
      <ListFilters
        query={query}
        onQueryChange={setQuery}
        typeFilter={typeFilter}
        onTypeFilterChange={setTypeFilter}
        dateFrom={dateFrom}
        onDateFromChange={setDateFrom}
        dateTo={dateTo}
        onDateToChange={setDateTo}
      />

      {filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No uploads match your search.
        </p>
      ) : (
        filtered.map((session) => (
          <Card key={session.id}>
            <CardHeader>
              <CardTitle className="truncate">{session.displayTitle}</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-between gap-4">
              <div className="flex flex-col gap-0.5 text-sm text-muted-foreground">
                <span>{kindLabel(session)}</span>
                <span>
                  Shared {new Date(session.created_at).toLocaleDateString()}
                </span>
              </div>
              <div className="flex shrink-0 gap-2">
                <CopyLinkButton sessionId={session.id} />
                <Link
                  href={`/s/${session.id}`}
                  className="inline-flex h-8 items-center rounded-md border border-input px-3 text-sm hover:bg-accent hover:text-accent-foreground"
                >
                  View
                </Link>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
