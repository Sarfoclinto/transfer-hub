// Guest ownership mechanic (Phase 3): a guest session has no auth.uid(), so
// possession of a secret token is what proves ownership for edit/delete.
// The raw token is returned to the client ONCE and stored in localStorage
// (not a cookie -- sent explicitly as a header, sidestepping CSRF entirely).
// Only the HASH is ever persisted server-side, same principle as password
// storage: if the database leaked, the tokens inside it would be useless.
import { randomBytes, createHash, timingSafeEqual } from "crypto";

// 256 bits of entropy, hex-encoded -- same order of magnitude as a UUID v4
// but generated specifically as a bearer secret, not an identifier.
export function generateOwnerToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashOwnerToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Constant-time comparison -- a naive `===` on hashes leaks timing info
// that, over enough requests, can help an attacker guess the right value.
// Overkill for a hobby project's threat model, but it's free to do right.
export function verifyOwnerToken(token: string, storedHash: string): boolean {
  const incomingHash = Buffer.from(hashOwnerToken(token), "hex");
  const expectedHash = Buffer.from(storedHash, "hex");
  if (incomingHash.length !== expectedHash.length) return false;
  return timingSafeEqual(incomingHash, expectedHash);
}

// Shared write/manage-access check used by request-upload, confirm-upload,
// and the owner-only parts of download (Phase 3): an authenticated session
// requires the caller's verified uid to match owner_id; a guest session
// requires a valid X-Owner-Token header. Centralized here so the three
// call sites can't quietly drift out of sync with each other.
export function verifySessionOwnership(
  session: { owner_id: string | null; owner_token_hash: string | null },
  userId: string | null,
  request: Request,
): boolean {
  if (session.owner_id !== null) {
    return userId === session.owner_id;
  }
  const ownerToken = request.headers.get("X-Owner-Token");
  if (!ownerToken || !session.owner_token_hash) return false;
  return verifyOwnerToken(ownerToken, session.owner_token_hash);
}
