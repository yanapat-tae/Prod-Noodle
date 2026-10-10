# Handoff: prod-noodle-pos

Snapshot date: **10 October 2026, Asia/Bangkok**. Read together with README.md and AGENTS.md. The latest section below supersedes older release and test-data status. This file describes the actual implementation; architecture-baseline.md also contains deferred proposals.

## Current project status

The one-step kitchen release is implemented and validated locally, but has not been deployed. Bank-confirmed payment speech is blocked on an actual bank payment-notification integration; the owner uses K PLUS on iPhone. No manual-confirmation payment speech was added. Details and deployment prerequisites are in the 10 October section below.

The implemented milestone is the online restaurant pilot with the owner menu, named takeaway and village delivery, per-dish free notes, owner menu creation/renaming, corrected menu details and safe recovery from uncertain order submissions. React/Vite, Node demo, HTML preview and Supabase architecture are preserved. The database and staff API changes are deployed on project `emjktqzcvgjwtsgysljy`; the frontend release is verified on Cloudflare Pages. Live URL: `https://prod-noodle.pages.dev`. Previous URL/APP_ORIGIN configuration blockers are resolved. Real-device kitchen/POS acceptance is still required; no App Store app is being built.

This folder originally had no `.git`, remote or commit author. The project is now committed and published to [yanapat-tae/Prod-Noodle](https://github.com/yanapat-tae/Prod-Noodle), branch `main`, with the user-provided author email. The remote was initially empty; no history was rewritten or force-pushed. Application and handoff work are separated into logical commits. Remote revision was verified and the GitHub repository was cloned successfully for independent checks. Use `git status --short --branch`, `git log -1 --oneline`, and `git ls-remote origin refs/heads/main` to verify the latest revision. The repository is ready for Cloud continuation; the hosted pilot now awaits restaurant acceptance.

## What is completed

- Shared React/TypeScript screens, Node demo API and browser-local HTML adapter.
- 38 owner-menu dishes, 58 variants and six searchable categories; emoji placeholders, large Thai controls, cart/options/pricing, free notes and receipts/status.
- Required takeaway name; optional village delivery with required address/soi and phone, shared with POS/kitchen. Legacy orders without these details remain readable.
- Owner creates menus with one to eight sizes, prices and existing option groups, and renames existing dishes while preserving historical bills; stable draft codes make retries safe even after later price edits.
- Eight-table sessions, daily takeaway queues, retry protection and historical price snapshots.
- Four mock staff accounts, POS entry, kitchen status/sound, full cash or confirmed-PromptPay recording, owner refunds and close/reopen table visits.
- Daily/monthly dashboard, hourly/channel/top-menu charts, CSV export, owner price/availability edits and nine QR entries.
- GrabFood/LINE MAN daily summary/CSV replacement import, avoiding duplicate totals.
- PWA shell, manifest/icons, hosting routing/headers and guarded online API source.
- Six SQL migrations, two seed files, RLS/grants, transaction RPCs, ledger/reporting, opaque customer tokens and staff Auth guards.
- 36 Node/PGlite tests covering domain/HTTP/database behavior, order details, owner menu validation/retries/authorization, real catalog upgrades and historical bills, including the existing 40-request local burst.
- 16 Chromium scenarios: seven dashboard/CSV cases, two takeaway/village flows, four owner menu creation/edit/retry flows and three uncertain-submit/reload cases. The nine unchanged scenarios passed in the full run; all seven affected menu/submit cases passed after the final HTTP-error fix.
- Handoff tooling: pinned Node/pnpm, full typecheck/lint/check scripts, ESLint configuration, portable dependency installer and secret-safe example environment.

## Partially completed / intentionally deferred

- Supabase: migrations, menu reads, CORS, customer order submission/readback and same-key retries are verified live, including eight concurrent table orders. Actual QR scanning, authenticated staff UI and Realtime acceptance on real phones remain.
- Hosting: configuration now works. Verify the published frontend revision and use the owner’s existing QR entries for acceptance; do not rotate QR as part of a code deployment.
- PWA: build assets exist; real iOS/Android installation, offline/reconnect and 200% text zoom are unverified.
- Menu: transcribed all 38 entries from the supplied photo and owner corrections. Owner can adjust operational availability/prices in the UI; no photos or recipe/inventory system was added.
- Voice: Thai prompt/schema examples only, no endpoint or AI calls. Photos, direct delivery APIs, automatic payment verification, split payments, native XLSX and account-management/password-reset UI remain deferred.

## Known limitations

- `preview.html` is a mock, with synthetic sales and browser storage, never a shared database. Its direct `file:` opening has not been tested by Codex's browser tooling. Generated JS syntax and mock API behavior were checked previously. Use a modern browser supporting `crypto.randomUUID` and `structuredClone`.
- Demo API binds localhost only. PIN `1234` is public demo data, not a production credential. Persistent `.local-data/demo.json` stays on the original machine; it contains previous fake test sales and must not be published or treated as actual shop revenue. Fresh clones start empty.
- API does not auto-reload; restart `pnpm dev` after server edits. Node does not read Vite's `.env.local`.
- Dashboard updates when opened or manually refreshed. Figures/export are unavailable while loading or after failure; late responses cannot overwrite another period. Delivery summaries cannot supply hourly/item-level breakdowns; missing order count is reported as incomplete.
- A single short SQL advisory lock serializes mutations for one restaurant. One authorized live burst of eight table orders passed; it does not establish sustained lunch-load capacity or device rendering latency.
- Staff active-order reads fail at 1,000 rows to avoid silent truncation. Long-running operation may need pagination/archive work later.
- Source typechecking uses a Deno shim; PGlite emulates Supabase Auth/roles. These checks are not a hosted integration test.
- `pnpm preview` is a static build preview, not a complete demo backend. Use `pnpm dev` for demo interaction; online builds require correctly configured Supabase services.
- SQL Editor installation does not record CLI migration history. Reconcile history before adopting `supabase db push`; do not rerun migrations against an existing schema blindly.

## One-step kitchen completion and latest owner handoff · 10 October 2026

Before edits, the clean cloud checkout was on branch `work` at `492ef40`, matching remote `main`; the newest README/HANDOFF commit was also `492ef40`. Baseline `pnpm check` passed all 36 Node/PGlite tests, and all 16 Chromium scenarios passed. Read-only live probes found the existing `index-DUO-GUVk.js` frontend asset and 40 menu items, consistent with the 9 October deployment. These probes do not verify database migration history or current order counts; management credentials were unavailable.

Additional GitHub branch/PR inspection found outstanding work outside `main`: [PR #1](https://github.com/yanapat-tae/Prod-Noodle/pull/1), `security/review-and-ci-20261009` at `d6326cd`, adds security CI, Edge request hardening and security tests. Its commit is dated 9 October 11:34:51 UTC, and its Security review workflow passed. It is unmerged, not a newer `main` deployment, and was not incorporated into this kitchen release. Coordinate README/HANDOFF edits and rerun the combined tests when merging it; do not treat its tests/hardening as present in this branch. The kitchen implementation is on `feat/one-step-kitchen-completion` with commits `389be58` (status rules/tests) and `aa97636` (UI/browser tests/release notes), published as [draft PR #2](https://github.com/yanapat-tae/Prod-Noodle/pull/2).

The owner reports that on 10 October all 26 old test bills and related payment records were cleared, and visits for all eight tables were closed. Menus, accounts and QR entries were retained. This newer report supersedes the older statement that live test orders remain new/unpaid. It was not independently queried in this session. **Never repeat the cleanup:** orders may have arrived afterward. No live order/payment/visit mutation, cleanup, seed, QR rotation or account change was performed during this work.

The shared ticket now has a single “เสร็จ/เสิร์ฟแล้ว” button. Domain rules (used by the demo server and HTML mock) allow active `new`, `preparing` and `ready` orders directly to `served`. The new migration `20261010031000_one_step_kitchen_completion.sql` applies the same rule to `staff_order_action` while retaining intermediate transitions for older clients. Repeating completion returns the existing order without a duplicate status event. Terminal orders cannot reopen. Completion preserves item/price snapshots and leaves payment state unchanged; unpaid served bills remain in POS and still block table closing. Existing cancellation, full-payment, owner-only refund, authenticated staff and service-only RPC restrictions are preserved.

Regression tests were observed failing against the old implementation before the changes. Final local checks: `pnpm check` passes all 39 Node/PGlite tests, frontend/Edge typecheck, zero-warning lint, production build and regenerated `preview.html`. All 20 Chromium scenarios pass, including direct completion from each active status, kitchen-to-POS retention at a 390px viewport, and an API failure that keeps the ticket visible. Browser runs used the cloud instance's system Chromium 151.0.7922.173 through an ignored local config because bundled Playwright downloads are restricted. Independent read-only code review found no actionable issue. These tests do not prove Supabase/Deno or real iPhone behavior.

Payment speech changed during the conversation: the owner first selected staff-confirmed PromptPay, then explicitly replaced it with **actual KBank receipt confirmation**, speaking “จ่ายเงิน [ยอด] บาทแล้ว”. The owner uses **K PLUS on iPhone**. A browser cannot consume another iPhone app's notification directly; a supported bank/merchant API or webhook is a prerequisite for a bank-confirmed feature. Do not silently fall back to staff-confirmed speech or mark bills paid based on a notification amount alone. No speech or automatic-bank-payment implementation is included in this kitchen release. Existing cashier-confirmed PromptPay behavior stays as before.

Production deployment is still pending. Cloudflare's Git integration automatically deployed the branch frontend preview at commit `aa97636`, and its GitHub check reports success. This is not a completed online release: the new migration has only been applied in local PGlite tests, and preview Auth/CORS/environment configuration has not been verified. The local build is demo-mode validation. Apply only the new function migration to the existing project after inspecting its current function definition and migration history; do not use a blind `db push`, rerun old migrations/seeds, or clean live data. Then publish the Supabase-mode frontend through the existing Pages Git integration, preserving public environment values, owner-created menus, Auth, QR and existing data. The Edge handler interface is unchanged and does not need redeployment for this status-rule change. Verify CORS, auth guards and the published asset; leave real order mutation for the owner's acceptance test.

The environment had no usable Supabase management binding/CLI credential. A saved configuration draft adds `SUPABASE_ACCESS_TOKEN` for `api.supabase.com`, the exact site/project domains and `api.github.com` for review metadata. It initially also declared `CLOUDFLARE_API_TOKEN` for `api.cloudflare.com`; later GitHub checks demonstrated that the existing Pages Git integration deploys automatically, so that Cloudflare token is unnecessary for this workflow and its extra requirement can be removed in Environment settings. No credential values were supplied or printed. Git read/push work with the platform proxy; initially blocked GitHub API access later succeeded, allowing branch/PR inspection and draft PR creation. Supply only the necessary Supabase credential securely in Environment settings and apply needed network configuration before retrying the database step. Saving a draft does not itself apply credentials, run scripts or publish. Do not claim this release is live until the new migration and production frontend publication are verified.

## Menu corrections, submission recovery and live load test · 9 October 2026

Code commit `41bef37` is pushed to `main` and verified live on Pages: customer asset `index-DUO-GUVk.js`, staff asset `Staff-B8Tw50PE.js`. `staff-api` version 4 is ACTIVE. Applied and recorded new migrations `20261009112857_owner_menu_rename.sql` and `20261009113319_owner_menu_corrections.sql`; all six migrations are present remotely. Original migration files, existing QR entries and previous bill snapshots are preserved. The live menu has 40 active dishes: 38 source dishes plus two Owner-created dishes.

Corrected hotpot description to serving 2–3 people, renamed ice cream, removed only the two unwanted crispy-pork-rice toppings, and standardized zero-cost options to `+0 บาท`. Owner can rename a menu through the existing editor; the new optional-name RPC overload preserves legacy callers and historical item names/prices. No new runtime environment variables or dependencies are required.

Expert code review identified raw fetch-error leakage and the risk of editing/re-keying an order after a lost response. The shared HTTP wrapper retries only reads or writes with an idempotency key, once, with the same body/key. Each attempt has a 20-second timeout. Uncertain order outcomes keep a persisted, locked draft; reloading and manual retry use the same request. Definitive application rejection permits editing. This addresses recovery/duplicate risk; it does not identify every possible mobile-network cause of “Load failed”.

Strict frontend/Edge typecheck, lint, build/HTML generation and all 36 Node/PGlite tests pass. Chromium coverage totals 16 scenarios as described above. Final SQL files also passed 12 database tests without draft-file overrides. Early localhost permission failures were execution-environment restrictions; they were resolved for checks.

At 18:37 Thailand time, the authorized [eight-table live test](docs/reports/2026-10-09-eight-table-test.md) sent five dishes per table through the actual customer API: 8/8 HTTP 200, 40 line items, 665–1,829 ms response time, all first submissions complete in 1,832 ms. Eight exact retries returned the original order IDs; independent SQL confirmed no duplicates, correct table/line counts and zero payment entries. CORS and customer readback passed. Test sessions were prepared with the existing SQL bootstrap RPC; QR scanning and kitchen screen rendering were not measured.

The eight clearly tagged test orders remain `new`/`unpaid` for the owner to inspect; do not silently delete, charge or cancel them. The private sessions and bootstrap file remain ignored in `.local-data/table-tests/`; only the reusable script and sanitized report are committed. Do not create a second run merely to reproduce this completed test. Wider/sustained tests should use an isolated test project. Real-device kitchen/POS/Realtime, intermittent mobile failures and PWA acceptance remain the next milestone.

## Owner menu and ordering release · 8 October 2026

User approved six categories, required takeaway names, village address/phone, free dish notes and owner-created menus. The photo correction is “ชามโปรดหมูแผ่น”; ice cream 30/40 refers to small/large sizes. No new environment variables or dependencies are required.

Applied migrations through the connected Supabase tool after PGlite validation. The CLI download was unavailable, so the tool-generated versions were recorded verbatim in local filenames: `20261008041620_order_details_and_menu_creation` and `20261008041631_owner_menu_catalog`. Original deployed migration files were not edited. Historical bills are retained: before/after counts 10 orders, total 77,500 satang and identical item-snapshot checksum. Live counts: eight tables, 38 active dishes, 58 active variants, six active categories. Trial-only braised pork is inactive, not deleted.

`staff-api` version 3 is ACTIVE with explicit staff/owner guards and unchanged verify_jwt=false. Deployment required an explicit relative `staff-api/deno.json` import-map path; the first attempt inherited an invalid old temporary path. Public menu HTTP returns 200/38 items; unauthenticated menu-create returns 401; both return the correct Pages CORS origin. No live test orders, new accounts or QR rotations were created during this release.

`pnpm check` passes all 28 Node/PGlite tests, frontend/Edge typecheck, lint, production build and HTML regeneration. All 12 Chromium tests pass. Review caught and fixed inconsistent option-template selection and stale saved demo catalogs: templates use stable code order in UI/demo/SQL; local version upgrades preserve custom dishes and edited prices. Browser tests use controlled API responses, not owner credentials. Run [acceptance steps](docs/acceptance-tests.md) on the published app.

Code commit `57e04fe` was pushed as a normal fast-forward to remote `main`, preserving earlier dashboard/handoff commits. Live `/` and `/admin` return 200. Cloudflare serves customer asset `index-Df0B-B0U.js` and staff asset `Staff-dFKMAZ-I.js`; inspection confirms named takeaway, village form, free notes and the menu-create endpoint/button in the published build. No extra user configuration was required. The final documentation commit follows this code release.

The dated entries below are historical; their old configuration/menu blockers are superseded by this release.

## Direct hosted verification and deployment · 7 October 2026

Supabase tools became available in this session. Direct queries verified eight tables, 14 dishes, 24 variants and exactly one active Owner profile for the user-supplied UID in slot 1. The migration history uses hosted versions `20261007000812` (`initial_schema`) and `20261007000819` (`application_api`), different from local filenames; reconcile version mapping before any CLI db push. Do not reapply the initial schema.

Deployed unchanged repository source for `public-api`, `customer-api` and `staff-api`, each version 1 / ACTIVE, with per-function deno.json and shared http.ts. Preserved `verify_jwt=false` after checking the existing customer token/staff Auth guards. Edge source typecheck passed before deployment.

Cloudflare serves `https://prod-noodle.pages.dev`. Inspection of deployed asset `index-jERAXyND.js` found the literal `VITE_SUPABASE_URL` as the URL value, rather than the actual project URL; the publishable-key-shaped value was not printed. Set the Production build variable to `https://emjktqzcvgjwtsgysljy.supabase.co` and redeploy. No application-code change is needed for this configuration error.

Read-only endpoint probes, including OPTIONS, return 503 with the application's missing-service-configuration message and no CORS header. This occurs before handler execution and identifies missing `APP_ORIGIN`; the user has been asked to set it to `https://prod-noodle.pages.dev` under Edge Function secrets. This connector cannot set secrets or Auth site/redirect settings. No test orders or QR rotations were performed. Login, menu HTTP results, rejection guards, CORS, Realtime and real-device flows must be retested after these two configuration fixes. Cloudflare main still lacks the local dashboard fix commits.

The historical report below describes what was known before direct tool access; its access/configuration blockers are superseded by this section.

## Supabase setup report · 7 October 2026

The user supplied results from a separate Supabase-enabled chat for `https://emjktqzcvgjwtsgysljy.supabase.co`:

- Both repository migrations applied; migration history contains only `initial_schema` and `application_api`.
- 22 public tables with RLS, three views and 15 functions reported after migrations.
- `seed.sql` then `menu-seed.sql` applied: eight tables, seven categories, 14 dishes and 24 variants. No data cleared or extra migrations created.
- Advisor reports mention `public.is_staff()` SECURITY DEFINER execution and unindexed foreign keys; these have not been independently investigated on the hosted database. Do not alter deployed schema merely to silence warnings.

These are user-reported hosted results, not queries executed from this development session. The Supabase connector's SQL/deployment tools are unavailable here. Local PGlite verification separately confirmed seed counts, duplicate-free reruns and preservation of edited prices. Seeds create no Auth accounts or QR credentials. Review [starter menu prices](docs/menu-review.md) before shop use; this does not block isolated technical testing.

Next: disable public signup, create the owner's Auth user, bind its UUID to slot 1 with role `owner`, then configure the public frontend key, Cloudflare Pages origin and all three Edge Functions. Start with the owner for integration testing and add actual staff profiles in slots 2–4 before staff testing. Never request passwords or privileged keys in chat. Hosting account/origin and owner Auth UUID are not yet supplied. Do not treat database setup alone as a completed online pilot.

## Linux continuation · 6 October 2026

The repository was inspected before code changes, including all three remote commits and the only remote branch, `main` at `2c03809`. A fresh Git clone had a clean working tree. Node 24.19.0 and pinned pnpm 11.25.0 installed from the lockfile, and the complete existing `pnpm check` passed before development. Work continues on `fix/dashboard-report-period`; verify local/remote Git state rather than assuming that branch has been pushed.

The dashboard previously kept prior-period totals exportable under the new date/month, and a late manual refresh could overwrite the selected report or display an obsolete error. Report data/errors are now tied to the selected staff identity, period and refresh; one effect guards every response and clears previous results. Empty dates prompt for a date without requesting data. No pricing, database, migration or API behavior changed. The shared HTML preview was regenerated.

After the fix, `pnpm check` passed again and `pnpm test:browser --workers=2` passed all seven Chromium tests. The original failures were reproduced before the fix, including a separate regression for returning to the previous date. Browser tests use the actual React app with controlled API responses and assert downloaded CSV content; they do not prove hosted Supabase integration or real-device PWA behavior. Independent code review reported no actionable findings.

Run `pnpm exec playwright install chromium --only-shell` once, then `pnpm test:browser`; port 5175 must be free. This suite is separate from `pnpm check`. In restricted Cloud environments, use a writable `PLAYWRIGHT_BROWSERS_PATH` for both browser installation and tests. Shell network permission was needed for Git/npm/browser downloads and localhost HTTP/browser tests. Initial EPERM failures were environment restrictions, not application defects or missing Supabase secrets.

## Historical handoff validation · 5 October 2026

`pnpm check` passed: frontend/preview and Edge typechecks, lint with zero warnings, all five existing tests, production build and HTML regeneration. A fresh source export and a clean local Git clone both passed setup/checks. After publishing, a fresh clone from GitHub at `99b9657` independently installed all dependencies from an empty store with `bash scripts/cloud-setup.sh` and passed `pnpm check`. All 77 files, migrations/seeds, environment example and documentation links were present, with no private data or generated/cache directories tracked. This verifies GitHub clone/setup on this Mac; actual Linux Cloud execution remains unverified. Subsequent handoff edits document these results without changing application code.

The 77 project files total approximately 1.36 MB; the largest is the required standalone HTML preview (705,857 bytes). A staged-content credential-pattern scan found no matches; `.env.example` has only blank public-service fields and safe demo defaults. No real .env files, local sales, dependency caches or build output are included. All four migration/seed files are committed with the application source in `02b9e93`; documentation/setup follow in a separate commit. Whitespace and local documentation-link checks passed. See docs/validation.md for scope. No Linux Cloud execution, real-device or hosted load results are claimed.

## Next recommended task and milestone

Complete online acceptance using [the test steps](docs/acceptance-tests.md): actual owner login, existing customer QR, named takeaway/village delivery, kitchen visibility, owner menu creation and payments/reporting on multiple devices. Add real staff accounts when the owner is ready. Check iOS/Android PWA install/offline behavior, then measure lunch load only on an isolated test project. Keep voice, photos and delivery partner APIs deferred.

Continuation prompt:

> Read HANDOFF.md, README.md and AGENTS.md. Check local/remote Git state and run pnpm check plus pnpm test:browser. Continue acceptance on emjktqzcvgjwtsgysljy and prod-noodle.pages.dev. Do not rerun the applied migrations/seeds or rotate QR unnecessarily. Preserve historical bills and distinguish automated/mock tests from live acceptance.

## Exact commands after cloning

Repository: `https://github.com/yanapat-tae/Prod-Noodle.git`, branch `main`.

```sh
git clone https://github.com/yanapat-tae/Prod-Noodle.git
cd Prod-Noodle
git switch main
node --version                         # use Node 24; nvm install / nvm use if available
npm install --global pnpm@11.25.0
pnpm install --frozen-lockfile
cp .env.example .env.local              # fresh clone only; keep local values private
pnpm check
pnpm dev
```

For a Cloud install step: select Node 24, run `bash scripts/cloud-setup.sh`, then `pnpm check` (or `npx --yes pnpm@11.25.0 check` if pnpm is unavailable). The installer needs pinned pnpm or standard npm/npx, plus registry access; it contains no Mac-specific paths. Tests use ephemeral HTTP ports and PGlite in memory; no external DB/account is needed. Local tests do not touch the user's demo sales file.

Customer: `http://127.0.0.1:5173/?table=1`; takeaway: `?table=takeaway`; staff: `/admin`, PIN `1234` in demo only. HTML can also be opened directly without commands/accounts. Regenerate it with `pnpm preview:html` after changing shared UI or preview code.

## Required external services

| Work | Services |
| --- | --- |
| Local/HTML review and existing checks | None; package registry needed for fresh dependency install |
| Git handoff | User's GitHub repository and write authentication |
| Codex Cloud continuation | GitHub repository access and a prepared Cloud environment with Node 24 |
| Online restaurant trial | Supabase project + Cloudflare Pages, owner account and actual staff accounts when ready |
| Voice | None in current scope; Gemini is deferred |

An iPhone workflow should use the pushed repository/branch and the prepared environment, not local Mac file paths. Environment setup/publish and GitHub access still need to be confirmed; this handoff cannot prove an account's Cloud access. See [official Cloud environments guide](https://learn.chatgpt.com/docs/environments/cloud-environments).

## Environment and database

- Local/demo: no required secrets; `VITE_APP_MODE=demo`. Optional exported `DEMO_STAFF_PIN`/`DEMO_PORT` defaults are `1234`/`4174`. Vite proxy must match the API port.
- Online frontend: `VITE_APP_MODE=supabase`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`.
- Keep reserved `VITE_ENABLE_VOICE=false` and `VITE_ENABLE_MENU_PHOTOS=false`; changing flags does not implement features.
- Edge: required `APP_ORIGIN` secret. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are Supabase-supplied runtime values; never expose privileged keys through VITE_.
- Load script only: `PILOT_ALLOW_WRITE=TEST_DATA_ONLY`, `PILOT_MODE`, `PILOT_BASE_URL`, `PILOT_QR_TOKEN`, `PILOT_PUBLISHABLE_KEY`, `PILOT_WORKERS`, `PILOT_ORDERS_PER_WORKER`; use an isolated trial DB. `.env.example` and docs/cloud-setup.md contain safe examples/defaults.
- `GEMINI_API_KEY`/`GEMINI_MODEL` are unused future placeholders. Deployment CLI authentication is tool configuration, not application frontend configuration.

On a new Supabase project, apply all four `supabase/migrations/*.sql` files in filename order, then `supabase/seed.sql` and `supabase/menu-seed.sql`. Existing projects receive only unapplied migrations. The deployed pilot already has all four; reconcile the first two hosted version numbers before using CLI db push.

Seeds do not create passwords, accounts or QR tokens. Follow docs/cloud-setup.md to disable signup, create four Auth users/profiles, deploy all three guarded functions and set `APP_ORIGIN`. All migrations/seeds must be tracked by Git. Future deployed changes require a new migration.

## Design decisions and preservation

Retain the low-cost architecture: static frontend + Supabase online, local JSON demo for development, offline HTML for design review. Elderly-friendly Thai UI and no initial image/voice costs are explicit user preferences. Money is integer satang, dates are Asia/Bangkok, writes are server-validated/idempotent, historical prices stay immutable, and delivery summaries replace a channel/day total rather than adding twice. Online `verify_jwt=false` relies on explicit handler authorization and must not be interpreted as public staff access.

Track source, package/lock/config files, migrations/seeds, documentation, icons, and `preview.html` (under 1 MB; retained for the user's account-free review). Ignore `.env*` except `.env.example`, `.local-data/`, dependency stores, node_modules, build intermediates and `dist/`. Original ignored files remain intact on this Mac. No existing work or history should be deleted, rewritten or force-pushed.
