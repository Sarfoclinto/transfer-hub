// TODO (deferred past M3S3): same one-time-link/access-logging snag as
// image-preview.tsx -- see that file's comment for the full reasoning.
// PDF rendering itself is trivial (<iframe>/<embed> against a presigned
// URL, Phase 2); the blocker is the same non-consuming read path this
// and image preview both need, best built alongside Milestone 5.
export {};
