// TODO (deferred past M3S3): native <img> against a presigned GET URL --
// straightforward in principle (Phase 2), but NOT a trivial reuse of the
// existing /api/items/[id]/download endpoint. That endpoint atomically
// consumes one-time items and increments download_count/logs a 'download'
// access_event on every hit -- exactly right for an explicit download
// click, wrong for an <img> tag that fires the same request just to render
// a thumbnail. Rendering a one-time item inline would silently burn its
// single use before the person ever clicks Download.
//
// The real fix needs a separate, non-consuming read path (a distinct
// /preview endpoint, or an intent query param) that still enforces
// visibility/expiry but explicitly refuses to serve one-time items inline
// at all (forcing Download-only UI for those, since previewing IS a content
// access for something meant to be accessed exactly once). Worth building
// this properly alongside Milestone 5, when one-time links get an actual
// UI toggle and this distinction has real stakes for the first time --
// building it now, before any item can even be marked one_time from the
// UI, risks designing it against a case we can't yet test end-to-end.
export {};
