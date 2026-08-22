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
  password: z.string().min(4).max(100).optional(),
});

export type CreateSessionInput = z.infer<typeof createSessionSchema>;

export const requestUploadSchema = z.object({
  session_id: z.string().uuid(),
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
  session_id: z.string().uuid(),
  content: z
    .string()
    .min(1)
    .max(5 * 1024 * 1024),
  language: z.string().trim().max(50).optional(),
  title: z.string().trim().max(255).optional(),
  one_time: z.boolean().optional().default(false),
});

export type CreateTextItemInput = z.infer<typeof createTextItemSchema>;

// Content editing stays text-only (Phase 4 MVP scope -- replacing file
// bytes would need to re-trigger the whole upload/confirm cycle, a real v2
// concern). Renaming (title) is a display-label override, not a content
// change, so it applies to any item kind -- a file's actual bytes and its
// real filename in R2 are untouched either way, this only changes what's
// shown. At least one field must be present, and text_content is rejected
// server-side for a non-text item (the route enforces this, since zod
// alone can't know the item's kind).
export const updateItemSchema = z
  .object({
    title: z.string().trim().max(255).optional(),
    text_content: z
      .string()
      .min(1)
      .max(5 * 1024 * 1024)
      .optional(),
  })
  .refine(
    (data) => data.title !== undefined || data.text_content !== undefined,
    {
      message: "Provide a title or text_content to update.",
    },
  );

export type UpdateItemInput = z.infer<typeof updateItemSchema>;

export const updateSessionSchema = z.object({
  title: z.string().trim().max(200),
});

export type UpdateSessionInput = z.infer<typeof updateSessionSchema>;
