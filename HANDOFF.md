# Handoff: prod-noodle-pos

Snapshot date: **11 October 2026, Asia/Bangkok**. Read together with README.md and AGENTS.md. Current instructions are here; dated release evidence is preserved in [the history archive](docs/history/2026-10-handoff.md). This file describes the actual implementation; architecture-baseline.md also contains deferred proposals.

## Current project status

The full menu-management release and customer-header change are **deployed**. [PR #6](https://github.com/yanapat-tae/Prod-Noodle/pull/6), head `e1b1586`, merged as `33977bab857d29f6c8d8e245636e50c4b6acb6e7` on 11 October. It includes per-menu sizes/options/defaults/limits, ordering, archive/restore, customer copy and preview, fried egg +10 baht on the two existing basil dishes, and ice-cream 3/4 toppings with removable default peanuts. Table, storefront and LINE ordering pages omit staff navigation; staff enter `/admin` directly.

Fresh verification of `e1b1586` passed `pnpm check` (64/64 Node/PGlite tests, both typechecks, lint, build and generated HTML) and the full 37/37 Chromium suite. Only the two new menu migrations were applied, then `staff-api` v5 was deployed before frontend merge. Supabase generated hosted versions `20261011071952` (`20261011010000_menu_management.sql`) and `20261011071957` (`20261011010001_requested_menu_options.sql`). All eleven migrations are installed; **do not replay migrations/seeds or run CLI `db push` without reconciling version mappings**. Database Read/Write, Migrations Read/Write and Edge Functions Read/Write are now verified through the configured environment token; no secret value was displayed.

Cloudflare production deployment `a2dc31c1-8bdb-41de-aaf9-83a89e6ac106` succeeded at 14:22:30 Bangkok. Live `/` and `/admin` return HTTP 200 with `index-Dkp6uLLI.js` and `Staff-C13PegMU.js`; all four served JS/CSS assets exactly match the production-configured build. The hosted catalog returns 41 active dishes, requested options and unchanged original prices. Staff access without login returns 401; allowed CORS returns 204 and an untrusted origin returns 403. See [deployment evidence and iPhone checklist](docs/reports/2026-10-11-menu-deployment.md), [implementation/review evidence](docs/reports/2026-10-11-menu-management.md) and [the owner guide](docs/menu-management.md).

Immediate before/after migration fingerprints matched existing orders, order items/options, payments, status events, table/customer sessions, staff profiles, ten QR rows and original menu/price fields. The fresh baseline had 26 orders and 28 payment entries; these are historical observations, never cleanup targets. Private fingerprint evidence is in ignored `.local-data/deploy-menu/`. No bill cleanup, seed replay, QR rotation, hosted acceptance order/payment or account change was performed.

Physical iPhone/Safari and authenticated hosted-owner editing remain untested. The production assets and hosted catalog were also rendered locally at 390px, with only customer session/order responses simulated, to check the three ordering entry types and option display without hosted writes. This does not establish a real-phone or authenticated hosted acceptance result.

The one-step kitchen release, Coke label, distinct alert tones and ten persistent QR entries are deployed and verified on 10 October. Bank-confirmed payment speech is blocked on an actual bank payment-notification integration; the owner uses K PLUS on iPhone. No manual-confirmation payment speech was added. Release evidence is in the history archive; real-device acceptance remains outstanding.

The implemented milestone is the online restaurant pilot with the owner menu, named takeaway and village delivery, per-dish free notes, owner menu creation/renaming, corrected menu details and safe recovery from uncertain order submissions. React/Vite, Node demo, HTML preview and Supabase architecture are preserved. The database and staff API changes are deployed on project `emjktqzcvgjwtsgysljy`; the frontend release is verified on Cloudflare Pages. Live URL: `https://prod-noodle.pages.dev`. Previous URL/APP_ORIGIN configuration blockers are resolved. Real-device kitchen/POS acceptance is still required; no App Store app is being built.

Repository: [yanapat-tae/Prod-Noodle](https://github.com/yanapat-tae/Prod-Noodle), branch `main`. Check `git status --short --branch`, `git log -1 --oneline`, and the fetched remote before starting. [PR #1](https://github.com/yanapat-tae/Prod-Noodle/pull/1) (`security/review-and-ci-20261009`, `d6326cd`) remains separate, unmerged security/CI work; its changes are not part of this release.

The owner reported clearing 26 old test bills and closing eight visits on 10 October. **Do not repeat cleanup.** The later sound/QR release found four new orders and four payment entries; counts are historical observations, never a cleanup target. Preserve bills, users, QR hashes and idempotency.

## Code review and file organization · 10 October 2026

The follow-up review starts from `25e1708`, after deployed PR #3. Regression fixes prevent a delayed full refresh from restoring an older ticket, isolate refreshes by login, reject out-of-order Realtime reads, coalesce a burst of order bells, and ignore audio callbacks from a muted or logged-out session and superseded enable taps. Successful mutations update the screen immediately from the server response. The review changes no SQL or Edge Functions.

Staff components, sound playback, QR helpers and state synchronization are grouped in `src/staff/`; `src/pages/Staff.tsx` composes the screens. Dated handoffs are archived without deleting their evidence. Fresh-install instructions now match the seeded database test order. See [review evidence](docs/reports/2026-10-10-code-review.md) and [file map](docs/project-structure.md).

Final validation passed: `pnpm check` (49 Node/PGlite tests, both typechecks, lint, build and regenerated HTML) and all 31 Chromium scenarios. [PR #4](https://github.com/yanapat-tae/Prod-Noodle/pull/4) merged as `90907dfb38e7f7a6bafd410a6f15b65f7f59ac9a` on 10 October at 21:22:08 Bangkok. Cloudflare Pages completed successfully. Live `/` and `/admin` serve `index-B0EMpNbE.js` and `Staff-CCT1MioV.js`; the staff bundle includes the snapshot/audio fixes and persistent-QR screen. The public menu still returns 40 active dishes and Coke at 20 baht. Verification was read-only; no live order, payment, session or QR was changed.

## What is completed

- Shared React/TypeScript screens, Node demo API and browser-local HTML adapter.
- 38 owner-menu dishes, 58 variants and six searchable categories; emoji placeholders, large Thai controls, cart/options/pricing, free notes and receipts/status.
- Required takeaway name; optional village delivery with required address/soi and phone, shared with POS/kitchen. Legacy orders without these details remain readable.
- Owner creates menus with one to eight sizes, prices and existing option groups, and renames existing dishes while preserving historical bills; stable draft codes make retries safe even after later price edits.
- Eight-table sessions, daily takeaway queues, retry protection and historical price snapshots.
- Four mock staff accounts, POS entry, kitchen status/sound, full cash or confirmed-PromptPay recording, owner refunds and close/reopen table visits.
- Daily/monthly dashboard, hourly/channel/top-menu charts, CSV export, owner price/availability edits and ten persistent QR entries with explicit per-entry rotation.
- GrabFood/LINE MAN daily summary/CSV replacement import, avoiding duplicate totals.
- PWA shell, manifest/icons, hosting routing/headers and guarded online API source.
- Eleven SQL migrations, two seed files, RLS/grants, transaction RPCs, ledger/reporting, opaque customer tokens and staff Auth guards.
- 64 Node/PGlite tests covering domain/HTTP/database behavior, order details, owner menu validation/retries/authorization, real catalog upgrades and historical bills, including the existing 40-request local burst.
- 37 Chromium scenarios cover dashboard/CSV, takeaway/village, menu creation/edit/retry, uncertain submission, one-step kitchen/POS, sounds, persistent QR and staff-session races. All passed after the file moves.
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

An iPhone workflow should use the pushed repository/branch and the prepared environment, not local Mac file paths. This Linux workspace has passed local checks and GitHub access; a new environment still needs its own setup validation. See [official Cloud environments guide](https://learn.chatgpt.com/docs/environments/cloud-environments).

## Environment and database

- Local/demo: no required secrets; `VITE_APP_MODE=demo`. Optional exported `DEMO_STAFF_PIN`/`DEMO_PORT` defaults are `1234`/`4174`. Vite proxy must match the API port.
- Online frontend: `VITE_APP_MODE=supabase`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`.
- Keep reserved `VITE_ENABLE_VOICE=false` and `VITE_ENABLE_MENU_PHOTOS=false`; changing flags does not implement features.
- Edge: required `APP_ORIGIN` secret. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are Supabase-supplied runtime values; never expose privileged keys through VITE_.
- Load script only: `PILOT_ALLOW_WRITE=TEST_DATA_ONLY`, `PILOT_MODE`, `PILOT_BASE_URL`, `PILOT_QR_TOKEN`, `PILOT_PUBLISHABLE_KEY`, `PILOT_WORKERS`, `PILOT_ORDERS_PER_WORKER`; use an isolated trial DB. `.env.example` and docs/cloud-setup.md contain safe examples/defaults.
- `GEMINI_API_KEY`/`GEMINI_MODEL` are unused future placeholders. Deployment CLI authentication is tool configuration, not application frontend configuration.

On a **new isolated project only**, apply `202610050001_initial_schema.sql` and `202610050002_application_api.sql`, then `seed.sql` and `menu-seed.sql`, then the remaining migrations in filename order. The later QR migration needs the eight seeded tables. See [the complete sequence](docs/cloud-setup.md#1-สร้าง-supabase-project-ทดลองแยก). The deployed pilot already has all eleven migrations; do not rerun them or the seeds. Its first two hosted versions are `20261007000812` and `20261007000819`; the two menu versions are mapped above. Reconcile history before CLI `db push`.

Seeds do not create passwords, accounts or QR tokens. The final QR migration creates the ten persistent entries; use the owner screen to view them. Follow docs/cloud-setup.md to disable signup, create the owner profile and up to three staff profiles, deploy all three guarded functions and set `APP_ORIGIN`. All migrations/seeds must be tracked by Git. Future deployed changes require a new migration.

## Design decisions and preservation

Retain the low-cost architecture: static frontend + Supabase online, local JSON demo for development, offline HTML for design review. Elderly-friendly Thai UI and no initial image/voice costs are explicit user preferences. Money is integer satang, dates are Asia/Bangkok, writes are server-validated/idempotent, historical prices stay immutable, and delivery summaries replace a channel/day total rather than adding twice. Online `verify_jwt=false` relies on explicit handler authorization and must not be interpreted as public staff access.

Track source, package/lock/config files, migrations/seeds, documentation, icons, and `preview.html` (under 1 MB; retained for the user's account-free review). Ignore `.env*` except `.env.example`, `.local-data/`, dependency stores, node_modules, build intermediates and `dist/`. Existing ignored local data remains outside Git. No existing work or history should be deleted, rewritten or force-pushed.

## POS improvement release · 11 October 2026

Read [POS progress](docs/POS-IMPROVEMENT-PROGRESS.md) and Git status before resuming.
All seven implementation scopes are tested and deployed after the user's explicit
approval. [PR #7](https://github.com/yanapat-tae/Prod-Noodle/pull/7) merged as `b1304e7`.

Hosted migration history now thirteen entries. New mappings:

- `20261011143222_pos_profiles_and_note.sql` → hosted `20261011145139`,
  name `pos_profiles_and_note` (already applied before approval).
- `20261011143223_pos_bill_integrity.sql` → hosted `20261011161310`,
  name `pos_bill_integrity` (applied once during approved release).

Do not replay migrations/seeds or the exact-profile operation. All six requested
Auth users already exist and active POS profiles are correct: เต้, ปลั๊ก, พี่ปราง = owner;
พ่อ, ฟ้า, แม่ = admin (restricted Staff). Do not recreate users or reset their passwords.

`public-api` v3 and `staff-api` v6 ACTIVE; deployed source matches the release.
`customer-api` v2 unchanged. Cloudflare Production `999da28a-d08a-4960-b23d-ece4a84f805e`
SUCCESS on main merge b1304e7. Served HTML/JS/CSS matches production-configured build;
public catalog41/categories6, protected API401/untrusted origin403 checks passed.
All existing row hashes across11 tables remain unchanged except intentional global
menu sort/revision normalization; visible menu sequence and note remain correct.

Fresh merged checks73/73, prior unchanged UI Chromium43/43 and native PostgreSQL8
connection races passed. Hosted read-only Staff/owner/report/RLS checks also passed.
No production test order/payment/refund was created. Physical iPhone/Safari, real
password logins and successful hosted transaction/reorder interaction remain NOT TESTED.
Have staff refresh existing tabs: legacy single-order dine-in payment returns409.
See [rollback](docs/POS-ROLLBACK.md) and [evidence](docs/reports/2026-10-11-pos-improvement.md).
Docs-only follow-ups may trigger another automatic Pages build; application assets are unchanged.
