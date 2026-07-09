import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Deliberately not a client component -- react-markdown doesn't touch any
// browser-only APIs, so this renders fully server-side with zero extra
// client JS shipped for what's otherwise just a read-only preview.
export function MarkdownPreview({ content }: { content: string }) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none rounded-md border border-border bg-secondary/50 p-4">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
