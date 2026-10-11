# Menu management implementation and review · 11 October 2026

Base `b279bbcad1d2fc683d351bc6964ce3969060c16e`; branch `feat/full-menu-management`, [draft PR #6](https://github.com/yanapat-tae/Prod-Noodle/pull/6). The existing workspace changes and approved design/plan were retained. Existing one-step kitchen, sound, billing and persistent-QR behavior remains covered by the regression suite.

## Implemented behavior

Owner can add/edit/reorder/archive/restore dishes, maintain sizes and prices, per-menu modifier groups/options/enablement/defaults/variant limits and customer instructions/labels/notes. A shared customer component provides the real ordering screen and an owner preview that sends no order. The category list remains usable with every dish archived.

New catalog data adds optional fried egg at 1,000 satang only to the two existing live basil codes, without creating duplicate dishes or changing prices. Mahachai ice cream permits up to three toppings on small and four on large; toppings are ถั่วทอง, ฟักทองเชื่อม, มันเชื่อม, ลูกชิด and สับปะรดเชื่อม. Peanuts default to include, may be omitted explicitly and do not count toward the quota. The preset heading is “ขนาดไอศกรีม”, preserving explicit owner labels. Large→small retains four selected toppings and requires correction.

New normalized link metadata isolates names/prices to one menu. Revisions reject stale owner saves; the transaction binds request key to actor and payload and returns confirmed retries before revision checks. Removed menu/variant/option rows remain available to historical order references. New invalid orders reject archived/disabled choices while an exact retry returns its already-created bill. Legacy menu APIs retain their signatures and advance revisions.

## Review and regression evidence

An independent whole-branch reviewer examined source, SQL, adapters, HTML mock and tests for `b279bbc..7984c65`. No Critical issue was found. The Important finding was reproduced: a successful reorder POST plus successful owner read and failed public read was reported as an uncertain save, allowing a second move from refreshed rows. The fix separates confirmed writes from reads, blocks more mutations until catalog synchronization and exposes a read-only retry. Both asymmetric owner/public refresh failures are covered. Lost POST responses still retain the original payload/key.

The reviewer also found the approved ice-cream heading absent from untouched presets. This omitted task requirement was completed in the local and new SQL data presets, preserving explicit owner customization. Local and PGlite assertions failed before the fix and passed after it.

Targeted domain/menu/DB/API and browser tests ran before implementation and exposed the expected failures. The all-archived browser case additionally exposed the app's empty-catalog loading gate; a separate loaded flag allows the owner to open management when the public catalog is empty. No billing/QR flow was rewritten. Source changes are grouped under `src/staff/menu/`; no product dependency or lockfile changed.

Final code revision `630c9026db85282998db82376fa61f8dd8105eb4` passed `pnpm check`: 64/64 Node/PGlite tests, frontend/HTML and Edge typechecks, zero-warning lint, production build and regenerated HTML. The full Chromium suite passed 37/37 with two workers and system Chromium, including both asymmetric refresh regressions. `git diff --check` and local documentation links pass. Phone-width Chromium screenshots were inspected at 390px, and 390/430px scenarios check customer control height and horizontal overflow. Chromium mocks and PGlite do not prove physical Safari behavior or hosted execution.

## Historical deployment preflight and preservation

Customer-header follow-up removes the staff entry from all shared customer ordering pages (tables, storefront takeaway and remote/LINE takeaway), while `/admin` remains directly accessible with the existing authorization. A browser assertion reproduced the old staff link before the change. After the minimal header edit, `pnpm check` passes 64/64 tests, typechecks, lint, build and HTML generation; five targeted customer-options, takeaway/village and persistent-QR Chromium scenarios pass. The previous 37-scenario run predates this follow-up; the full browser suite was not repeated for this narrow edit. This frontend change is also pending deployment.

**At the original implementation handoff, not deployed or merged.** Supabase migration history still contains the original nine versions, latest `20261010090139`. The live order function matches the previously applied source. The token can read migration/database metadata but `/functions` returns HTTP 403 with `Missing required permission(s): edge_functions_read`. Edge Functions Read/Write permissions and an updated environment token are required before the tested stack can deploy.

Read-only preflight found 9 orders, 11 order items, 30 order-option snapshots, 5 payment entries, 18 status events, 23 table sessions, 13 customer sessions, 2 staff profiles and 10 QR entries. Those counts are observations, never a cleanup target. Hashes of protected rows and original menu/price fields are saved privately in ignored `.local-data/deploy-menu/`. No live order, payment, session, QR, seed or migration was changed during this task.

At that handoff, remaining: refresh preflight; apply only the new menu schema and requested-options migrations; deploy `staff-api`; merge the tested branch and verify Cloudflare/current assets and live read-only catalog/server installation/preservation. Then test authenticated owner editing and customer ordering on a real iPhone, using existing QR links. K PLUS bank notification speech remains deferred.

## Deployment completed · 11 October 2026

PR #6 head `e1b1586` subsequently passed fresh `pnpm check` (64/64) and the full Chromium suite (37/37), including the customer-header follow-up. Only the two new migrations were installed, `staff-api` v5 deployed and verified, then the PR merged as `33977ba` and Cloudflare production succeeded. Existing protected rows and original menu/price fields matched immediate preflight fingerprints; no cleanup, seed replay or QR rotation ran. Hosted catalog/API and exact production asset checks passed. See [the deployment report](2026-10-11-menu-deployment.md) for hosted version mappings, preservation evidence and the remaining iPhone/authenticated-owner acceptance checklist.
