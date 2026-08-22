// Sessions have an explicit `title` column, but nothing in the UI ever
// sets it -- every session was showing as "Untitled session," which makes
// a list of them useless for finding anything (the actual bug report this
// file exists to fix). Rather than force a title-entry step into the
// upload flow (friction the original design deliberately avoided), this
// derives a reasonable label from the session's own content instead:
// the first item's filename (or its title, for a text item), plus a
// "+N more" suffix for anything with more than one item.
//
// An explicit title, if one's ever set some other way, always wins --
// this is a fallback for the common case, not a replacement for a real
// title.
export type ItemForDisplayTitle = {
  kind: string;
  title: string | null;
  original_filename: string | null;
};

export function getSessionDisplayTitle(
  explicitTitle: string | null,
  items: ItemForDisplayTitle[],
): string {
  if (explicitTitle) return explicitTitle;
  if (items.length === 0) return "Empty session";

  const first = items[0];
  const firstLabel =
    first.title ??
    (first.kind === "file" ? (first.original_filename ?? "File") : "Text note");

  if (items.length === 1) return firstLabel;
  return `${firstLabel} +${items.length - 1} more`;
}
