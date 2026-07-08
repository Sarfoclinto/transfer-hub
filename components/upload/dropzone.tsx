"use client";

import { useRef, useState } from "react";
import { Upload, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { UploadProgress } from "./upload-progress";
import type { SessionHandle, AddedItem } from "./mixed-upload-form";

type State =
  | { status: "idle" }
  | { status: "uploading"; percent: number; fileName: string }
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
}: {
  getSession: () => Promise<SessionHandle>;
  onAdded: (item: AddedItem) => void;
}) {
  const [state, setState] = useState<State>({ status: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  async function handleFile(file: File) {
    setState({ status: "uploading", percent: 0, fileName: file.name });

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
        }),
      });
      if (!requestRes.ok) {
        const body = await requestRes.json().catch(() => ({}));
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
          setState({ status: "uploading", percent, fileName: file.name }),
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

      onAdded({ id: item_id, kind: "file", title: file.name });
      setState({ status: "idle" });
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
          <p className="text-xs text-muted-foreground">{state.percent}%</p>
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
