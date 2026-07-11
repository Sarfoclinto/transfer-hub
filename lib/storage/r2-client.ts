// R2 is S3-compatible, so the regular AWS SDK works against it -- just
// pointed at R2's endpoint instead of AWS's, with "auto" region (R2 doesn't
// have AWS-style regions).
//
// Per Phase 2: bytes never transit the Next.js server. This client only ever
// generates short-lived presigned URLs; the actual PUT/GET happens directly
// between the browser and R2.
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function getR2Client() {
  return new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
}

const BUCKET = () => process.env.R2_BUCKET_NAME!;

// Storage key convention per Phase 2: {session_id}/{item_id}/{filename} --
// namespacing by session then item makes a whole session's objects a simple
// prefix operation, and avoids collisions without a separate lookup.
export function buildStorageKey(
  sessionId: string,
  itemId: string,
  filename: string,
) {
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${sessionId}/${itemId}/${safeFilename}`;
}

// Per Phase 2: previewable types (images, PDF, audio, video) get served
// inline so the browser renders them; everything else downloads as an
// attachment rather than potentially executing/rendering in the browser
// (relevant for things like .html or .svg that could otherwise run as
// content if a browser were tricked into treating them as navigable).
export function getContentDisposition(
  mimeType: string,
): "inline" | "attachment" {
  const previewable = ["image/", "application/pdf", "audio/", "video/"];
  return previewable.some((prefix) => mimeType.startsWith(prefix))
    ? "inline"
    : "attachment";
}


// Same underlying question as getContentDisposition (is this a type a
// browser can render directly), exposed as its own boolean for the
// preview endpoint rather than duplicating the previewable-types list a
// second time.
export function isPreviewableMime(mimeType: string): boolean {
  return getContentDisposition(mimeType) === "inline";
}

// Short expiry (minutes) by design -- limits the window a leaked upload URL
// stays valid. This is issued once per upload attempt, not reused.
export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  expiresInSeconds = 300,
) {
  const client = getR2Client();
  const command = new PutObjectCommand({
    Bucket: BUCKET(),
    Key: key,
    ContentType: contentType,
    ContentDisposition: getContentDisposition(contentType),
  });
  return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}

// Also short-lived. The person-facing share link is stable (a session ID in
// our own URL); this presigned R2 URL is regenerated fresh on every access
// behind that stable link, per Phase 2 -- don't confuse the two.
export async function getPresignedDownloadUrl(
  key: string,
  expiresInSeconds = 300,
) {
  const client = getR2Client();
  const command = new GetObjectCommand({ Bucket: BUCKET(), Key: key });
  return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}

// Used at confirm-upload time (Milestone 2) to verify the object actually
// landed and get its real size -- never trust the client's claimed size.
export async function headObject(key: string) {
  const client = getR2Client();
  const command = new HeadObjectCommand({ Bucket: BUCKET(), Key: key });
  return client.send(command);
}

export async function deleteObject(key: string) {
  const client = getR2Client();
  const command = new DeleteObjectCommand({ Bucket: BUCKET(), Key: key });
  return client.send(command);
}

// TODO (Milestone 6): bulk-delete-by-prefix for the expiration cleanup cron
// (list objects under a session's prefix, delete in batches). Not needed
// until that milestone, kept out for now rather than built speculatively.
