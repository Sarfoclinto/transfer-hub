// Phase 2 policy: guests get a strict allowlist (no executables); an
// authenticated upload is broader, including installers/binaries. Byte-
// sniffing against actual file content (not just claimed MIME/extension)
// happens at confirm-upload time in slice 3, once the bytes are actually in
// R2 -- this file only covers the claim-time check, which is the first line
// of defense, not the only one.
//
// Checking by extension rather than solely by claimed MIME type: browsers
// and OSes report MIME types inconsistently (a .json file might arrive as
// "application/json", "text/plain", or even "application/octet-stream"
// depending on the browser), so extension is the more reliable signal at
// this stage. Both are still checked -- see isUploadAllowed below.

const GUEST_ALLOWED_EXTENSIONS = new Set([
  "txt",
  "md",
  "json",
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "pdf",
  "mp3",
  "wav",
  "ogg",
  "mp4",
  "mov",
  "webm",
  "zip",
]);

// Deliberately excluded even though it might seem harmless: .svg can embed
// <script> tags and gets rendered inline by browsers -- exactly the
// stored-XSS-via-preview risk flagged in Phase 2. Not worth the tradeoff
// for a "just an image format" convenience.

const NEVER_ALLOWED_FOR_GUESTS = new Set([
  "exe",
  "msi",
  "apk",
  "dmg",
  "bat",
  "cmd",
  "sh",
  "ps1",
  "dll",
  "scr",
  "jar",
]);

const GUEST_MAX_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB
const AUTHED_MAX_SIZE_BYTES = 500 * 1024 * 1024; // 500 MB -- per-file cap, tune later

export function getFileExtension(filename: string): string {
  const parts = filename.toLowerCase().split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

export function getMaxSizeBytes(isGuest: boolean): number {
  return isGuest ? GUEST_MAX_SIZE_BYTES : AUTHED_MAX_SIZE_BYTES;
}

export function isUploadAllowed(
  filename: string,
  sizeBytes: number,
  isGuest: boolean,
): { allowed: true } | { allowed: false; reason: string } {
  const ext = getFileExtension(filename);
  const maxSize = getMaxSizeBytes(isGuest);

  if (sizeBytes > maxSize) {
    return {
      allowed: false,
      reason: `File exceeds the ${isGuest ? "guest" : "account"} size limit of ${Math.round(maxSize / (1024 * 1024))}MB.`,
    };
  }

  if (isGuest) {
    if (NEVER_ALLOWED_FOR_GUESTS.has(ext)) {
      return {
        allowed: false,
        reason: "This file type requires an account to upload.",
      };
    }
    if (!GUEST_ALLOWED_EXTENSIONS.has(ext)) {
      return {
        allowed: false,
        reason:
          "This file type isn't supported for guest uploads. Sign in for broader file type support.",
      };
    }
  }

  // Authenticated users: broader policy per Phase 4 MVP scope (includes
  // executables/installers). No extension blocklist for this path -- the
  // MVP mitigation for risky file types is requiring an account at all,
  // not a further allowlist on top of that. Virus scanning is explicitly
  // deferred post-MVP (Phase 2's risk-acceptance decision).

  return { allowed: true };
}
