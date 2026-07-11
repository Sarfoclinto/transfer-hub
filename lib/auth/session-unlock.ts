// Password-protected sessions (Phase 4 MVP) need a way to remember "this
// browser already entered the right password for this session" across
// requests -- both the page load AND the download endpoint need to check
// it, so it can't just be client-side component state.
//
// Design: an HttpOnly cookie per session, holding an HMAC-SHA256 of the
// session id keyed by a server-only secret. Stateless on purpose -- no
// database round-trip needed to check "was this unlocked," just recompute
// the HMAC and compare. Deliberately NOT time-limited or single-use: this
// is a casual-sharing feature (the password itself is the real barrier),
// not meant to be bank-grade, consistent with how one_time links and
// guest ownership tokens are scoped elsewhere in this app. A leaked
// unlock cookie is equivalent in severity to a leaked password.
import { createHmac, timingSafeEqual } from "crypto";

function getSecret(): string {
  const secret = process.env.SESSION_UNLOCK_SECRET;
  if (!secret) {
    throw new Error(
      "SESSION_UNLOCK_SECRET is not set -- required for password-protected sessions. See .env.local.example.",
    );
  }
  return secret;
}

export function signUnlockToken(sessionId: string): string {
  return createHmac("sha256", getSecret()).update(sessionId).digest("hex");
}

export function verifyUnlockToken(
  sessionId: string,
  token: string | undefined,
): boolean {
  if (!token) return false;
  const expected = Buffer.from(signUnlockToken(sessionId), "hex");
  const actual = Buffer.from(token, "hex");
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

export function unlockCookieName(sessionId: string): string {
  return `unlock_${sessionId}`;
}
