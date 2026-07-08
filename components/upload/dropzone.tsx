"use client";

import { useRef, useState } from "react";
import { Upload, Loader2, CheckCircle2, Copy, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { UploadProgress } from "./upload-progress";

type FlowState =
  | { status: "idle" }
  | { status: "uploading"; percent: number; fileName: string }
  | { status: "success"; sessionId: string; itemId: string }
  | { status: "error"; message: string };

// Wraps the actual R2 PUT in a Promise with progress events -- fetch's
// upload-progress support isn't reliable enough across browsers yet, so
// this is XHR specifically for that reason, not out of habit.
function uploadWithProgress(
  url: string,
  file: File,
  headers: Record<string, string>,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    Object.entries(headers).forEach(([key, value]) =>
      xhr.setRequestHeader(key, value),
    );
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else
        reject(
          new Error(
            `Upload failed (${xhr.status}). Check the bucket's CORS policy.`,
          ),
        );
    };
    xhr.onerror = () =>
      reject(
        new Error(
          "Upload failed -- check your connection and the bucket's CORS policy.",
        ),
      );
    xhr.send(file);
  });
}

export function Dropzone() {
  const [state, setState] = useState<FlowState>({ status: "idle" });
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  async function handleFile(file: File) {
    setState({ status: "uploading", percent: 0, fileName: file.name });

    try {
      // 1. Create a session. No visibility specified -- the route defaults
      // a guest session to 'unlisted', which is what makes the link
      // actually openable on another device (see the comment in
      // app/api/sessions/create/route.ts for why 'private' would be a
      // dead end here).
      const sessionRes = await fetch("/api/sessions/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!sessionRes.ok)
        throw new Error("Could not start a session. Please try again.");
      const session: { session_id: string; owner_token?: string } =
        await sessionRes.json();

      // Store the owner token client-side ONLY -- per Phase 3, this is
      // what proves ownership for managing this session later from this
      // same device/browser. It's never sent anywhere except as the
      // X-Owner-Token header on our own API calls.
      if (session.owner_token) {
        localStorage.setItem(
          `ownerToken:${session.session_id}`,
          session.owner_token,
        );
      }
      const ownerToken = session.owner_token;

      // 2. Request an upload slot.
      const requestRes = await fetch("/api/items/request-upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(ownerToken ? { "X-Owner-Token": ownerToken } : {}),
        },
        body: JSON.stringify({
          session_id: session.session_id,
          filename: file.name,
          mime_type: file.type || "application/octet-stream",
          size_bytes: file.size,
        }),
      });
      if (!requestRes.ok) {
        const body = await requestRes.json().catch(() => ({}));
        throw new Error(body.error ?? "This file can't be uploaded.");
      }
      const { item_id, upload_url, content_disposition } =
        await requestRes.json();

      // 3. PUT the actual bytes directly to R2 -- never through our own
      // server (Phase 2). Content-Type and Content-Disposition must match
      // exactly what was signed server-side, or R2 rejects the request.
      await uploadWithProgress(
        upload_url,
        file,
        {
          "Content-Type": file.type || "application/octet-stream",
          "Content-Disposition": content_disposition,
        },
        (percent) =>
          setState({ status: "uploading", percent, fileName: file.name }),
      );

      // 4. Confirm -- this is what flips the item to 'ready' and makes it
      // visible to anyone with the link.
      const confirmRes = await fetch("/api/items/confirm-upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(ownerToken ? { "X-Owner-Token": ownerToken } : {}),
        },
        body: JSON.stringify({ item_id }),
      });
      if (!confirmRes.ok)
        throw new Error(
          "Upload completed but could not be confirmed. Please try again.",
        );

      setState({
        status: "success",
        sessionId: session.session_id,
        itemId: item_id,
      });
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "Something went wrong.",
      });
    }
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    setIsDragOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  const shareUrl =
    state.status === "success"
      ? `${window.location.origin}/s/${state.sessionId}`
      : "";

  async function copyLink() {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (state.status === "success") {
    return (
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-4 pt-6 text-center">
          <CheckCircle2 className="size-10 text-accent" />
          <p className="text-sm text-muted-foreground">
            Uploaded. Open this link on any device:
          </p>
          <div className="flex w-full items-center gap-2 rounded-md border border-border bg-secondary px-3 py-2">
            <span className="flex-1 truncate text-left text-sm">
              {shareUrl}
            </span>
            <Button size="sm" variant="ghost" onClick={copyLink}>
              <Copy className="size-4" />
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setState({ status: "idle" })}
          >
            Upload another
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (state.status === "uploading") {
    return (
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-4 pt-6 text-center">
          <Loader2 className="size-8 animate-spin text-accent" />
          <p className="max-w-full truncate text-sm text-muted-foreground">
            {state.fileName}
          </p>
          <div className="w-full">
            <UploadProgress percent={state.percent} />
          </div>
          <p className="text-xs text-muted-foreground">{state.percent}%</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={`w-full max-w-md border-2 border-dashed transition-colors ${
        isDragOver ? "border-accent bg-accent/5" : "border-border"
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
    >
      <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
        <Upload className="size-8 text-muted-foreground" />
        <div>
          <p className="font-medium">Drag a file here, or</p>
          <Button
            variant="link"
            onClick={() => inputRef.current?.click()}
            className="px-0"
          >
            browse to upload
          </Button>
        </div>
        {state.status === "error" && (
          <p className="flex items-center gap-1.5 text-sm text-destructive">
            <AlertCircle className="size-4" />
            {state.message}
          </p>
        )}
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </CardContent>
    </Card>
  );
}
