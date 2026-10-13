# Supabase and Cloudflare service usage

The owner approved an owner-only Usage page showing both services and instructed deployment after both are implemented. Preserve the existing Accessible Simple Thai UI, six staff profiles, all-staff QR viewing, historical sales and production QR links. Execute inline without requesting the same authorization again.

## Behavior and authority

- Add “การใช้โควตา” to the owner navigation. Show separate Supabase and Cloudflare sections with used/limit, percentage, remaining capacity, source, collection time and reporting period. Mobile widths 390/430px and text zoom must remain usable.
- Measured zero is distinct from unavailable. Unknown metrics have no percentage/progress bar. Unlimited static requests and unused Pages Functions have explanatory states, not fabricated zero usage. Percentages may exceed 100%; only the visual bar is capped. Warn at 80% and 95% with text as well as color.
- Supabase database bytes are measured using the documented sum of pg_database_size across pg_database. Storage is summed from object size metadata, with missing metadata reported as unavailable. These are current sizes, not monthly counters. Database quota 500,000,000 bytes and Storage quota 1,000,000,000 bytes use decimal units explicitly.
- Monthly Supabase billing metrics are not exposed through the tested public management endpoint (404); the Studio endpoint rejects the configured PAT (401). Show unavailable counters with a link to official Usage instead of inferring billing from orders/logs or embedding private Dashboard credentials. Include functions, uncached/cached egress, Realtime messages and peak connections.
- Cloudflare account `a40b7e1a8b9d034c0461a2d0bdcd2b7e` and project `prod-noodle` were verified through the official Pages API. A server-side collector enumerates account projects and all retained deployment pages, counting builds that started in the current UTC calendar month. Label this as retained build history, not an exact billing ledger; deleted records cannot be recovered. Free quota 500 builds/month, 100 Pages projects/account. Optional published-artifact file counts and largest-file sizes use 20,000 files and 25 MiB limits and record the deployed revision.
- Provider snapshots show their actual collection time. A snapshot older than 24 hours is marked stale. A monthly snapshot outside its reporting period is unavailable, not zero. The “โหลดข้อมูลล่าสุด” button loads current DB/Storage and the latest collected Cloudflare snapshot; it does not pretend to contact Cloudflare directly.

## Backend and collection

- Reuse the existing staff API and active-owner guards. A service-only, SECURITY INVOKER RPC returns DB/Storage sizes and sanitized provider snapshots. The new snapshot table has RLS and no browser grants. No management token is ever added to the frontend or copied into hosted secrets.
- `scripts/sync-service-usage.mjs` uses the configured Supabase/Cloudflare credentials only in the authorized execution environment, reads official APIs and upserts non-secret usage snapshots. It can be run during releases and subsequent maintenance. No background scheduler or new paid service is introduced; automatic scheduled collection is outside this release.
- Snapshot collection is a write to monitoring metadata only. Preserve orders, payments, users, menus, QR entries and deployed migration history. Apply one new migration and deploy staff API before frontend.
- Demo/standalone HTML show clearly labeled examples and never claim to monitor hosted services.

## Verification and release

Test source completeness, month rollover, stale/error/null states, percentages over 100%, authentication and owner-only access, demo parity and iPhone-width layout. Run pnpm check and the browser suite. Review the whole diff, then deploy the authorized migration/Edge/frontend release and verify hosted assets, auth denials, and actual usage values. Capture evidence and remaining limitations in the handoff.
