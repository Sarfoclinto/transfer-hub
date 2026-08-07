"use client";

import { Input } from "@/components/ui/input";

const TYPE_OPTIONS = [
  { value: "all", label: "All types" },
  { value: "text", label: "Text only" },
  { value: "file", label: "Files only" },
  { value: "mixed", label: "Mixed" },
] as const;

// Deliberately "dumb"/controlled -- this component owns no state itself,
// just renders inputs and reports changes upward. Whatever list it's
// paired with (dashboard's SessionList, the public gallery) owns the
// actual filter state and does the filtering, since each knows its own
// full list to filter against. Shared here rather than duplicated because
// both contexts hit the exact same underlying problem: with everything
// auto-titled from content rather than a real user-chosen name, search +
// type + date range together are what make a long list of sessions
// actually navigable.
export function ListFilters({
  query,
  onQueryChange,
  typeFilter,
  onTypeFilterChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  typeFilter: string;
  onTypeFilterChange: (value: string) => void;
  dateFrom: string;
  onDateFromChange: (value: string) => void;
  dateTo: string;
  onDateToChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Input
        placeholder="Search..."
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        className="flex-1"
      />
      <select
        value={typeFilter}
        onChange={(e) => onTypeFilterChange(e.target.value)}
        className="rounded-md border border-input bg-transparent px-3 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {TYPE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => onDateFromChange(e.target.value)}
          className="rounded-md border border-input bg-transparent px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="From date"
        />
        <span>to</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => onDateToChange(e.target.value)}
          className="rounded-md border border-input bg-transparent px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="To date"
        />
      </div>
    </div>
  );
}
