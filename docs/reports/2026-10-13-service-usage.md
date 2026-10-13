# Supabase and Cloudflare Usage release · 13 October 2026

The owner approved an owner-only page for both providers and explicitly requested deployment after both were ready. Implementation is on `feat/provider-usage-20261013`, based on the latest production `d844f10`, preserving the 12 October sales-history and all-staff QR releases.

## Behavior and limits

The page shows real PostgreSQL database size and Storage object size, timestamped Cloudflare retained-history builds across the account and account project count, unlimited static-request status and whether this Pages project uses Functions. Percentage warnings are textual as well as colored. Missing data is never converted to zero; monthly rollover and snapshots older than 24 hours are explicit.

Supabase billing Usage is unavailable through the tested public endpoint (404), and the Studio endpoint rejects the configured PAT (401). API/Egress/Realtime cards therefore link to the official dashboard without fabricated usage. Cloudflare snapshots are collected at release/maintenance time, not by a new scheduler. Reload reads current DB/Storage and the latest saved Cloudflare collection. No management token is embedded in client code or copied into hosted secrets.

## Validation and review

- Node 24.19.0, pnpm 11.25.0; frozen lockfile install.
- Clean latest-main baseline: 82/82 Node/PGlite tests passed.
- Meaningful RED→GREEN tests cover unknown/zero/over-limit values, stale/month boundaries, source completeness, owner authorization, DB/browser grants, demo adapters and mobile presentation.
- Fresh final `pnpm check`: 96/96 tests, both typechecks, zero-warning lint, production build and generated HTML passed.
- New mobile browser scenarios: 3/3 passed at 390/430px, including 200% text sizing. Physical iPhone Safari is not simulated by Chromium.
- The first whole browser run had 52 passing and one existing POS retry timing failure while running concurrently with heavy PGlite checks. That POS scenario passed in isolation; the complete browser rerun passed **53/53** without concurrent DB tests.
- Fresh independent review: no Critical findings; one Important truncated-pagination issue reproduced and fixed with a failing-then-passing regression. Collection now reconciles count, per-page size, total count/pages and stable pagination. Minor deferred: a dedicated pending-request logout browser scenario is absent; inspected keyed-unmount/generation guards prevent late data from another identity being applied.

## Rulings and preflight

The latest native migration CLI tried to create a directory in the read-only home; an older CLI postinstall also failed. A fresh UTC migration filename was generated in the writable repository instead. Existing hosted version mappings remain unchanged. The installed system Chromium is used through the existing local browser config; downloading Playwright Chromium was denied by destination policy.

Automatic approval review rejected an optional full-row hash preservation query across production sales/profile/session tables as unrequested sensitive-data handling. The query was not executed and was not retried indirectly. Verification uses the narrow new schema/RPC/grants, code diff and tests; no whole-row preservation claim is made.

Hosted preflight confirmed existing staff-api v7, verify_jwt=false with explicit Auth/profile guards, and 15 applied migrations. A read-only service_role preflight could read database sizes and Storage objects. The proposed migration creates only a service-only monitoring table and invoker RPC; it changes no sales/menu/Auth/QR data.

## Deployment

The completed browser suite permits the authorized sequence: apply `20261013044500_service_usage.sql` once; deploy the guarded staff API; publish frontend; collect Cloudflare snapshot; verify hosted assets, anonymous denial, RPC permissions and real values. Deployment outcome is recorded below after verification. No old migration, seed, cleanup, Auth account or QR rotation is part of this release.
