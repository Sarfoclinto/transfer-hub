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
  visibility: z.enum(["private", "unlisted", "public"]).default("private"),
  expiresInDays: z.number().int().min(1).max(90).optional(),
});

export type CreateSessionInput = z.infer<typeof createSessionSchema>;

export const requestUploadSchema = z.object({
  session_id: z.uuid(),
  filename: z.string().trim().min(1).max(255),
  mime_type: z.string().trim().min(1).max(127),
  size_bytes: z.number().int().positive(),
});

export type RequestUploadInput = z.infer<typeof requestUploadSchema>;

export const confirmUploadSchema = z.object({
  item_id: z.string().uuid(),
});

export type ConfirmUploadInput = z.infer<typeof confirmUploadSchema>;

