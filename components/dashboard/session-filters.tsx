"use client";

import { Input } from "@/components/ui/input";

const TYPE_OPTIONS = [
  { value: "all", label: "All types" },
  { value: "text", label: "Text only" },
  { value: "file", label: "Files only" },
  { value: "mixed", label: "Mixed" },
] as const;

// Deliberately "dumb"/controlled -- this component owns no state itself,
// just renders inputs and reports changes upward. session-list.tsx owns
// the actual filter state and does the filtering, since it's the one that
// knows the full session list to filter against.
export function SessionFilters({
  query,
  onQueryChange,
  typeFilter,
  onTypeFilterChange,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  typeFilter: string;
  onTypeFilterChange: (value: string) => void;
}) {
  return (
    <div className="flex gap-2">
      <Input
        placeholder="Search by title..."
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        className="flex-1"
      />
      <select
        value={typeFilter}
        onChange={(e) => onTypeFilterChange(e.target.value)}
        className="rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {TYPE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
