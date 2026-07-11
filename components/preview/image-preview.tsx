export function ImagePreview({ itemId, alt }: { itemId: string; alt: string }) {
  // Deliberately not next/image: the source is our own redirecting API
  // route to a presigned R2 URL, not a static/known-dimension asset
  // next/image's optimizer expects.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/items/${itemId}/preview`}
      alt={alt}
      loading="lazy"
      className="max-h-80 w-full rounded-md border border-border bg-secondary object-contain"
    />
  );
}
