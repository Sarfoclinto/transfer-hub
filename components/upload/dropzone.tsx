"use client";

import { useRef, useState } from "react";
import { Upload, Loader2, AlertCircle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { UploadProgress } from "./upload-progress";
import type { SessionHandle, AddedItem } from "./mixed-upload-form";

const MAX_AUTO_RETRIES = 2;

type State =
  | { status: "idle" }
  | { status: "uploading"; percent: number; fileName: string; attempt: number }
  | { status: "error"; message: string; file: File };

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
    // A real network-level failure, not a completed-but-rejected response --
    // e.g. the connection dropped, or the browser throttled/suspended
    // network activity because the tab was backgrounded during a long
    // transfer. This is common enough for large files that it's worth
    // retrying automatically rather than treating it as terminal.
    xhr.onerror = () =>
      reject(new Error("Connection interrupted during upload."));
    xhr.send(file);
  });
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// This component deliberately doesn't create sessions or own a "success"
// screen anymore (that was fine for a single file, but a mixed session can
// have several items added over time). It just adds ONE file to whatever
// session `getSession` resolves to, reports the result via `onAdded`, then
// resets to idle so another file can be dropped right after -- the calling
// orchestrator (mixed-upload-form.tsx) owns the running item list and the
// persistent share-link display.
export function Dropzone({
  getSession,
  onAdded,
  oneTime = false,
}: {
  getSession: () => Promise<SessionHandle>;
  onAdded: (item: AddedItem) => void;
  oneTime?: boolean;
}) {
  const [state, setState] = useState<State>({ status: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Each attempt re-runs the WHOLE flow from request-upload onward --
  // deliberately not just re-sending the same PUT, since a fresh
  // presigned URL is cheap to get and removes any doubt about whether a
  // stale/expired one contributed to the failure. attempt=1 is the first
  // real try; attempt>1 are automatic retries after a transient failure,
  // shown to the person so a slow-climbing retry doesn't look like it's
  // silently stuck.
  async function handleFile(file: File, attempt = 1) {
    setState({ status: "uploading", percent: 0, fileName: file.name, attempt });

    try {
      const { sessionId, ownerToken } = await getSession();

      const requestRes = await fetch("/api/items/request-upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(ownerToken ? { "X-Owner-Token": ownerToken } : {}),
        },
        body: JSON.stringify({
          session_id: sessionId,
          filename: file.name,
          mime_type: file.type || "application/octet-stream",
          size_bytes: file.size,
          one_time: oneTime,
        }),
      });
      if (!requestRes.ok) {
        const body = await requestRes.json().catch(() => ({}));
        // Not retried automatically -- a rejected request-upload call
        // (bad file type, quota exceeded, etc.) won't succeed on retry
        // without the person changing something, so failing fast here
        // avoids a pointless wait before showing them the real reason.
        throw new Error(body.error ?? "This file can't be uploaded.");
      }
      const { item_id, upload_url, content_disposition } =
        await requestRes.json();

      // PUT the actual bytes directly to R2 -- never through our own
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
          setState({
            status: "uploading",
            percent,
            fileName: file.name,
            attempt,
          }),
      );

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

      onAdded({ id: item_id, kind: "file", title: file.name, oneTime });
      setState({ status: "idle" });
    } catch (err) {
      if (attempt <= MAX_AUTO_RETRIES) {
        await wait(attempt * 1500); // small backoff: 1.5s, then 3s
        return handleFile(file, attempt + 1);
      }
      // Auto-retries exhausted -- surface a manual Retry button, keeping
      // the File object so retrying doesn't require re-selecting it.
      // (Failed pending items left behind by this are cleaned up
      // automatically by the expiration cron, not something the person
      // needs to think about.)
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "Something went wrong.",
        file,
      });
    }
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    setIsDragOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  if (state.status === "uploading") {
    return (
      <Card className="w-full">
        <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
          <Loader2 className="size-8 animate-spin text-accent" />
          <p className="max-w-full truncate text-sm text-muted-foreground">
            {state.fileName}
          </p>
          <div className="w-full">
            <UploadProgress percent={state.percent} />
          </div>
          <p className="text-xs text-muted-foreground">
            {state.percent}%
            {state.attempt > 1 &&
              ` -- retry ${state.attempt - 1} of ${MAX_AUTO_RETRIES}`}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={`w-full border-2 border-dashed transition-colors ${
        isDragOver ? "border-accent bg-accent/5" : "border-border"
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
    >
      <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
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
          <div className="flex flex-col items-center gap-2">
            <p className="flex items-center gap-1.5 text-sm text-destructive">
              <AlertCircle className="size-4" />
              {state.message}
            </p>
            <p className="text-xs text-muted-foreground">
              Large files can fail if this tab is backgrounded for a while --
              keeping it focused during upload helps.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleFile(state.file, 1)}
            >
              <RotateCw className="size-4" />
              Retry
            </Button>
          </div>
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
