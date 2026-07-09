// Per Phase 3's free-tier quota policy. Guests have no profile/quota at
// all -- their limits are per-file size caps and short expiration only
// (lib/storage/mime-policy.ts), never a running total, since there's no
// durable identity to track a total against.
export const AUTHED_STORAGE_QUOTA_BYTES = 2 * 1024 * 1024 * 1024; // 2GB

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function checkQuota(
  currentUsedBytes: number,
  additionalBytes: number,
): { allowed: true } | { allowed: false; reason: string } {
  if (currentUsedBytes + additionalBytes > AUTHED_STORAGE_QUOTA_BYTES) {
    const remaining = Math.max(
      0,
      AUTHED_STORAGE_QUOTA_BYTES - currentUsedBytes,
    );
    return {
      allowed: false,
      reason: `This would exceed your storage quota. ${formatBytes(remaining)} remaining of ${formatBytes(AUTHED_STORAGE_QUOTA_BYTES)}.`,
    };
  }
  return { allowed: true };
}
