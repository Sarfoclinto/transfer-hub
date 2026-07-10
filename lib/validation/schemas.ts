// zod schemas per API route, co-located conceptually with their route
// handlers even though centralized here (mirrors the FluentValidation
// pattern from prior ASP.NET Core work).
import { z } from "zod";

// Guests can't set their own expiration (always capped short, see Phase 4);
// this schema only lets an authenticated user optionally shorten the
// default -- the route handler enforces the guest override server-side,
// never trusting a client-supplied flag for "am I a guest."
export const createSessionSchema = z.object({
  title: z.string().trim().max(200).optional(),
  visibility: z.enum(["private", "unlisted", "public"]).optional(),
  expiresInDays: z.number().int().min(1).max(90).optional(),
});

export type CreateSessionInput = z.infer<typeof createSessionSchema>;

export const requestUploadSchema = z.object({
  session_id: z.uuid(),
  filename: z.string().trim().min(1).max(255),
  mime_type: z.string().trim().min(1).max(127),
  size_bytes: z.number().int().positive(),
  one_time: z.boolean().optional().default(false),
});

export type RequestUploadInput = z.infer<typeof requestUploadSchema>;

export const confirmUploadSchema = z.object({
  item_id: z.string().uuid(),
});

export type ConfirmUploadInput = z.infer<typeof confirmUploadSchema>;

// Text items skip the upload/confirm cycle entirely (Phase 2) -- they go
// straight into text_content, no R2 involved. Capped at ~5MB of text,
// generous for code/notes/config pastes without being unbounded; tune
// later if a real use case needs more.
export const createTextItemSchema = z.object({
  session_id: z.uuid(),
  content: z
    .string()
    .min(1)
    .max(5 * 1024 * 1024),
  language: z.string().trim().max(50).optional(),
  title: z.string().trim().max(255).optional(),
  one_time: z.boolean().optional().default(false),
});

export type CreateTextItemInput = z.infer<typeof createTextItemSchema>;

// Per Phase 4 MVP scope: only text content is editable, never files
// (replacing file bytes would need to re-trigger the whole upload/confirm
// cycle, a real v2 concern -- see components/upload dropzone's comments).
export const updateTextItemSchema = z.object({
  text_content: z
    .string()
    .min(1)
    .max(5 * 1024 * 1024),
});

export type UpdateTextItemInput = z.infer<typeof updateTextItemSchema>;
