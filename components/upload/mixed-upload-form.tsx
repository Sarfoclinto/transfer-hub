"use client";

import { useRef, useState } from "react";
import {
  FileText,
  File as FileIcon,
  Copy,
  Plus,
  AlertCircle,
  QrCode as QrCodeIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dropzone } from "./dropzone";
import { QrCode } from "@/components/qr-code";

export type SessionHandle = { sessionId: string; ownerToken?: string };
export type AddedItem = { id: string; kind: "file" | "text"; title: string };

const TEXT_LANGUAGE_OPTIONS = [
  { value: "plaintext", label: "Plain text" },
  { value: "markdown", label: "Markdown" },
  { value: "json", label: "JSON" },
  { value: "javascript", label: "Code" },
] as const;

export function MixedUploadForm() {
  const [session, setSession] = useState<SessionHandle | null>(null);
  const [items, setItems] = useState<AddedItem[]>([]);
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [isTextFormOpen, setIsTextFormOpen] = useState(false);
  const [textContent, setTextContent] = useState("");
  const [textTitle, setTextTitle] = useState("");
  const [textLanguage, setTextLanguage] = useState<string>("plaintext");
  const [textError, setTextError] = useState<string | null>(null);
  const [isSubmittingText, setIsSubmittingText] = useState(false);

  // Cached in-flight promise so a file drop and a text submission racing
  // each other (or two file drops in quick succession before the first
  // session-create call resolves) share ONE session instead of each
  // creating their own -- without this, rapid actions could end up
  // silently splitting items across two different sessions.
  const sessionPromiseRef = useRef<Promise<SessionHandle> | null>(null);

  async function ensureSession(): Promise<SessionHandle> {
    if (session) return session;
    if (!sessionPromiseRef.current) {
      sessionPromiseRef.current = (async () => {
        const res = await fetch("/api/sessions/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (!res.ok)
          throw new Error("Could not start a session. Please try again.");
        const data: { session_id: string; owner_token?: string } =
          await res.json();

        // Owner token stored client-side ONLY (Phase 3) -- proves
        // ownership for managing this session later from this device.
        if (data.owner_token) {
          localStorage.setItem(
            `ownerToken:${data.session_id}`,
            data.owner_token,
          );
        }
        const handle: SessionHandle = {
          sessionId: data.session_id,
          ownerToken: data.owner_token,
        };
        setSession(handle);
        return handle;
      })();
    }
    return sessionPromiseRef.current;
  }

  function handleAdded(item: AddedItem) {
    setItems((prev) => [...prev, item]);
  }

  async function handleAddText() {
    if (!textContent.trim()) return;
    setIsSubmittingText(true);
    setTextError(null);

    try {
      const { sessionId, ownerToken } = await ensureSession();
      const res = await fetch("/api/items/create-text", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(ownerToken ? { "X-Owner-Token": ownerToken } : {}),
        },
        body: JSON.stringify({
          session_id: sessionId,
          content: textContent,
          language: textLanguage,
          title: textTitle || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Could not add this text.");
      }
      const { item_id } = await res.json();
      handleAdded({
        id: item_id,
        kind: "text",
        title: textTitle || "Untitled note",
      });
      setTextContent("");
      setTextTitle("");
      setIsTextFormOpen(false);
    } catch (err) {
      setTextError(
        err instanceof Error ? err.message : "Something went wrong.",
      );
    } finally {
      setIsSubmittingText(false);
    }
  }

  const shareUrl = session
    ? `${window.location.origin}/s/${session.sessionId}`
    : "";

  async function copyLink() {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      {session && (
        <Card>
          <CardContent className="flex flex-col gap-3 pt-6">
            <div className="flex items-center gap-2">
              <span className="flex-1 truncate text-left text-sm">
                {shareUrl}
              </span>
              <Button size="sm" variant="ghost" onClick={copyLink}>
                <Copy className="size-4" />
                {copied ? "Copied" : "Copy"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowQr((v) => !v)}
              >
                <QrCodeIcon className="size-4" />
                {showQr ? "Hide QR" : "Show QR"}
              </Button>
            </div>
            {showQr && (
              <div className="flex justify-center">
                <QrCode value={shareUrl} />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Dropzone getSession={ensureSession} onAdded={handleAdded} />

      {isTextFormOpen ? (
        <Card>
          <CardContent className="flex flex-col gap-3 pt-6">
            <input
              className="rounded-md border border-input bg-transparent px-3 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Title (optional)"
              value={textTitle}
              onChange={(e) => setTextTitle(e.target.value)}
            />
            <textarea
              className="min-h-32 rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Paste or type text..."
              value={textContent}
              onChange={(e) => setTextContent(e.target.value)}
            />
            <select
              className="rounded-md border border-input bg-transparent px-3 py-1.5 text-sm"
              value={textLanguage}
              onChange={(e) => setTextLanguage(e.target.value)}
            >
              {TEXT_LANGUAGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {textError && (
              <p className="flex items-center gap-1.5 text-sm text-destructive">
                <AlertCircle className="size-4" />
                {textError}
              </p>
            )}
            <div className="flex gap-2">
              <Button
                onClick={handleAddText}
                disabled={isSubmittingText || !textContent.trim()}
                size="sm"
              >
                {isSubmittingText ? "Adding..." : "Add"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsTextFormOpen(false)}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsTextFormOpen(true)}
        >
          <Plus className="size-4" />
          Add text or a note
        </Button>
      )}

      {items.length > 0 && (
        <Card>
          <CardContent className="flex flex-col gap-2 pt-6">
            {items.map((item) => (
              <div key={item.id} className="flex items-center gap-2 text-sm">
                {item.kind === "text" ? (
                  <FileText className="size-4 text-muted-foreground" />
                ) : (
                  <FileIcon className="size-4 text-muted-foreground" />
                )}
                <span className="truncate">{item.title}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
