# R2 bucket CORS configuration

Browsers block a direct PUT from your app's origin to R2 until the bucket's
CORS policy explicitly allows it. Apply this in the Cloudflare dashboard:
**R2 → your bucket → Settings → CORS Policy → Add CORS policy** (or via the
API/wrangler if you prefer).

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Add your real deployed domain (e.g. `https://transferhub.app`) to
`AllowedOrigins` once you have one — a bucket with no CORS policy at all
will silently fail browser uploads with a CORS error that has nothing
obviously to do with CORS in the message, so this is worth doing now rather
than debugging it later during Milestone 2.

## Why PUT and HEAD, not POST

Presigned URLs from `getPresignedUploadUrl` (see `lib/storage/r2-client.ts`)
sign a `PutObjectCommand`, so the browser does a `PUT` with the file as the
raw body — not a multipart form POST. `HEAD` is included because
`confirm-upload` (Milestone 2) verifies the object landed via a HEAD request
before trusting it.
