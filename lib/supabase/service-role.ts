// TODO (Milestone 1, slice 3): service-role Supabase client.
// DELIBERATELY ISOLATED IN THIS FILE — this is the only client that bypasses
// RLS. Per Phase 3, its only legitimate use is the guest owner-token write
// path (verify token hash in app code, then use this client to perform the
// write). Every call site importing this file should be traceable to that
// pattern — do not import it for convenience elsewhere.
export {};
