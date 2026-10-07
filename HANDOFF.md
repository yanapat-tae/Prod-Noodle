# Handoff: prod-noodle-pos

Snapshot date: **7 October 2026, UTC**. Read together with README.md and AGENTS.md. This file describes the actual implementation; architecture-baseline.md also contains deferred proposals.

## Current project status

The completed milestone is a local QR ordering/POS MVP plus a single-file HTML design preview for **โปรด ก๋วยเตี๋ยวหมูโบราณ**, eight tables and takeaway. Linux Cloud baseline validation and dashboard reporting fixes are now complete. The online Supabase path is implemented. Trial project `emjktqzcvgjwtsgysljy` now has directly verified seed counts and an active Owner. All three Edge Functions are deployed. The frontend is at `https://prod-noodle.pages.dev`, but its Supabase URL build value is incorrect and Edge `APP_ORIGIN` is missing; hosted integration remains blocked on configuration. No App Store application is being built.

This folder originally had no `.git`, remote or commit author. The project is now committed and published to [yanapat-tae/Prod-Noodle](https://github.com/yanapat-tae/Prod-Noodle), branch `main`, with the user-provided author email. The remote was initially empty; no history was rewritten or force-pushed. Application and handoff work are separated into logical commits. Remote revision was verified and the GitHub repository was cloned successfully for independent checks. Use `git status --short --branch`, `git log -1 --oneline`, and `git ls-remote origin refs/heads/main` to verify the latest revision. The repository is ready for Cloud continuation; creating/publishing a Cloud environment and deploying the restaurant remain separate tasks.

## What is completed

- Shared React/TypeScript screens, Node demo API and browser-local HTML adapter.
- Fourteen starter dishes; emoji placeholders; large Thai customer controls; cart/options/pricing/notes and customer receipts/status.
- Eight-table sessions, daily takeaway queues, retry protection and historical price snapshots.
- Four mock staff accounts, POS entry, kitchen status/sound, full cash or confirmed-PromptPay recording, owner refunds and close/reopen table visits.
- Daily/monthly dashboard, hourly/channel/top-menu charts, CSV export, owner price/availability edits and nine QR entries.
- GrabFood/LINE MAN daily summary/CSV replacement import, avoiding duplicate totals.
- PWA shell, manifest/icons, hosting routing/headers and guarded online API source.
- Two SQL migrations, two seed files, RLS/grants, transaction RPCs, ledger/reporting, opaque customer tokens and staff Auth guards.
- Existing five test groups covering domain calculations, HTTP/session authorization/retries, 40 concurrent local requests, and PostgreSQL/RLS/transaction/reporting behavior.
- Seven Chromium browser regressions for dashboard date/month changes, CSV content, errors/retry, empty dates, returning to a previous date and stale refresh responses.
- Handoff tooling: pinned Node/pnpm, full typecheck/lint/check scripts, ESLint configuration, portable dependency installer and secret-safe example environment.

## Partially completed / intentionally deferred

- Supabase: schema/RPC/Edge adapters are ready for integration validation; actual Auth, PostgREST, Deno, WebSockets and deploy execution have not been tested.
- Hosting: `https://prod-noodle.pages.dev` serves the frontend, but the deployed Supabase URL build variable needs correction. No working customer QR has been verified.
- PWA: build assets exist; real iOS/Android installation, offline/reconnect and 200% text zoom are unverified.
- Menu: only fourteen starter entries; recipe/pricing confirmation and remaining menu transcription are needed.
- Voice: Thai prompt/schema examples only, no endpoint or AI calls. Photos, direct delivery APIs, automatic payment verification, split payments, native XLSX and new-menu/account-management/password-reset UI remain deferred.

## Known limitations

- `preview.html` is a mock, with synthetic sales and browser storage, never a shared database. Its direct `file:` opening has not been tested by Codex's browser tooling. Generated JS syntax and mock API behavior were checked previously. Use a modern browser supporting `crypto.randomUUID` and `structuredClone`.
- Demo API binds localhost only. PIN `1234` is public demo data, not a production credential. Persistent `.local-data/demo.json` stays on the original machine; it contains previous fake test sales and must not be published or treated as actual shop revenue. Fresh clones start empty.
- API does not auto-reload; restart `pnpm dev` after server edits. Node does not read Vite's `.env.local`.
- Dashboard updates when opened or manually refreshed. Figures/export are unavailable while loading or after failure; late responses cannot overwrite another period. Delivery summaries cannot supply hourly/item-level breakdowns; missing order count is reported as incomplete.
- A single short SQL advisory lock serializes mutations for one restaurant. No real shared-CPU or lunch-load measurement exists; do not infer free-tier capacity from localhost tests.
- Staff active-order reads fail at 1,000 rows to avoid silent truncation. Long-running operation may need pagination/archive work later.
- Source typechecking uses a Deno shim; PGlite emulates Supabase Auth/roles. These checks are not a hosted integration test.
- `pnpm preview` is a static build preview, not a complete demo backend. Use `pnpm dev` for demo interaction; online builds require correctly configured Supabase services.
- SQL Editor installation does not record CLI migration history. Reconcile history before adopting `supabase db push`; do not rerun migrations against an existing schema blindly.

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

Linux baseline checks are now verified. Review the existing HTML interface and confirm menu/prices with the owner, then proceed toward an **isolated Supabase + Cloudflare online pilot**, validated on multiple real phones and kitchen/POS tabs, followed by an opt-in free-tier lunch-load measurement. Continue with owner Auth/profile setup and hosting configuration on the identified trial project. Verify the reported database state when direct access becomes available; do not rerun the initial migrations. Account ownership alone does not provide project access. Hosting configuration and four staff Auth/profile accounts remain needed. Keep voice, photos and delivery APIs deferred.

Suggested continuation prompt:

> Read HANDOFF.md, README.md and AGENTS.md. Check branch/status and run pnpm check; run pnpm test:browser for dashboard UI work. Continue the isolated online pilot on project emjktqzcvgjwtsgysljy; migrations and seeds are reported applied, so proceed with owner Auth/profile and deployment configuration. Preserve the architecture, large Thai controls and emoji menus. Clearly distinguish demo/Chromium results from real Supabase/device validation.

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
| Online restaurant trial (future) | Supabase trial project + Cloudflare Pages, four staff Auth accounts |
| Voice | None in current scope; Gemini is deferred |

An iPhone workflow should use the pushed repository/branch and the prepared environment, not local Mac file paths. Environment setup/publish and GitHub access still need to be confirmed; this handoff cannot prove an account's Cloud access. See [official Cloud environments guide](https://learn.chatgpt.com/docs/environments/cloud-environments).

## Environment and database

- Local/demo: no required secrets; `VITE_APP_MODE=demo`. Optional exported `DEMO_STAFF_PIN`/`DEMO_PORT` defaults are `1234`/`4174`. Vite proxy must match the API port.
- Online frontend: `VITE_APP_MODE=supabase`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`.
- Keep reserved `VITE_ENABLE_VOICE=false` and `VITE_ENABLE_MENU_PHOTOS=false`; changing flags does not implement features.
- Edge: required `APP_ORIGIN` secret. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are Supabase-supplied runtime values; never expose privileged keys through VITE_.
- Load script only: `PILOT_ALLOW_WRITE=TEST_DATA_ONLY`, `PILOT_MODE`, `PILOT_BASE_URL`, `PILOT_QR_TOKEN`, `PILOT_PUBLISHABLE_KEY`, `PILOT_WORKERS`, `PILOT_ORDERS_PER_WORKER`; use an isolated trial DB. `.env.example` and docs/cloud-setup.md contain safe examples/defaults.
- `GEMINI_API_KEY`/`GEMINI_MODEL` are unused future placeholders. Deployment CLI authentication is tool configuration, not application frontend configuration.

Apply SQL in this exact order on a new Supabase project:

1. `supabase/migrations/202610050001_initial_schema.sql`
2. `supabase/migrations/202610050002_application_api.sql`
3. `supabase/seed.sql`
4. `supabase/menu-seed.sql`

Seeds do not create passwords, accounts or QR tokens. Follow docs/cloud-setup.md to disable signup, create four Auth users/profiles, deploy all three guarded functions and set `APP_ORIGIN`. All migrations/seeds must be tracked by Git. Future deployed changes require a new migration.

## Design decisions and preservation

Retain the low-cost architecture: static frontend + Supabase online, local JSON demo for development, offline HTML for design review. Elderly-friendly Thai UI and no initial image/voice costs are explicit user preferences. Money is integer satang, dates are Asia/Bangkok, writes are server-validated/idempotent, historical prices stay immutable, and delivery summaries replace a channel/day total rather than adding twice. Online `verify_jwt=false` relies on explicit handler authorization and must not be interpreted as public staff access.

Track source, package/lock/config files, migrations/seeds, documentation, icons, and `preview.html` (under 1 MB; retained for the user's account-free review). Ignore `.env*` except `.env.example`, `.local-data/`, dependency stores, node_modules, build intermediates and `dist/`. Original ignored files remain intact on this Mac. No existing work or history should be deleted, rewritten or force-pushed.
