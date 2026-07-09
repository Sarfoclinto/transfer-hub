import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

export function CodePreview({
  content,
  language,
}: {
  content: string;
  language?: string | null;
}) {
  return (
    <SyntaxHighlighter
      language={language && language !== "plaintext" ? language : "text"}
      style={oneDark}
      customStyle={{
        borderRadius: "var(--radius-md)",
        fontSize: "0.8rem",
        margin: 0,
      }}
    >
      {content}
    </SyntaxHighlighter>
  );
}
