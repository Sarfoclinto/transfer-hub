export function PdfPreview({ itemId }: { itemId: string }) {
  return (
    <iframe
      src={`/api/items/${itemId}/preview`}
      title="PDF preview"
      className="h-96 w-full rounded-md border border-border"
    />
  );
}
