// Upstash Redis-backed rate limiting for guest write endpoints (Phase 2/3
// abuse controls). Deliberately degrades to a no-op with a console warning
// if UPSTASH_* env vars aren't set, rather than throwing -- this is a real
// safety feature that matters before a public deploy, but shouldn't block
// local development for anyone who hasn't set up Upstash yet. The warning
// is loud on purpose: silent no-op rate limiting is the kind of gap that's
// easy to forget about until it matters.
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const isConfigured = Boolean(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
);

if (!isConfigured) {
  console.warn(
    "[rate-limit] UPSTASH_REDIS_REST_URL/TOKEN not set -- rate limiting is DISABLED. " +
      "Fine for local dev, not fine for a public deploy. See .env.local.example.",
  );
}

const redis = isConfigured
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  : null;

// 10 guest session creations per hour per IP -- Phase 3's suggested
// starting number for this control. Tune once real traffic patterns exist.
const guestSessionRatelimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "1 h"),
      prefix: "ratelimit:guest-session",
    })
  : null;

// Guest item creation (request-upload, create-text) -- separate, more
// generous bucket from session creation itself, since one legitimate
// mixed-session upload naturally creates several items in a row.
const guestItemRatelimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(30, "1 h"),
      prefix: "ratelimit:guest-item",
    })
  : null;

// Password unlock attempts -- tight window, since this is specifically a
// brute-force control (Phase 3), not a general abuse throttle.
const passwordAttemptRatelimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, "5 m"),
      prefix: "ratelimit:password-attempt",
    })
  : null;

export function getClientIp(request: Request): string {
  // Vercel (and most reverse proxies) set x-forwarded-for; proxy.ts doesn't
  // rewrite or strip it. Falls back to a constant so a missing header
  // degrades to "everyone shares one bucket" rather than throwing.
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

async function check(
  limiter: Ratelimit | null,
  key: string,
): Promise<{ allowed: true } | { allowed: false; reason: string }> {
  if (!limiter) return { allowed: true }; // not configured -- see warning above
  const { success } = await limiter.limit(key);
  if (!success) {
    return {
      allowed: false,
      reason: "Too many requests. Please try again later.",
    };
  }
  return { allowed: true };
}

export function checkGuestSessionRateLimit(request: Request) {
  return check(guestSessionRatelimit, getClientIp(request));
}

export function checkGuestItemRateLimit(request: Request) {
  return check(guestItemRatelimit, getClientIp(request));
}

export function checkPasswordAttemptRateLimit(
  request: Request,
  sessionId: string,
) {
  // Keyed by IP + session, not IP alone -- an IP legitimately guessing a
  // password on one shared link shouldn't burn its budget for every OTHER
  // password-protected link it might try today.
  return check(
    passwordAttemptRatelimit,
    `${getClientIp(request)}:${sessionId}`,
  );
}
