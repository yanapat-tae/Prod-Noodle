# Handoff: prod-noodle-pos

Snapshot date: **5 October 2026, Asia/Bangkok**. Read together with README.md and AGENTS.md. This file describes the actual implementation; architecture-baseline.md also contains deferred proposals.

## Current project status

The completed milestone is a local QR ordering/POS MVP plus a single-file HTML design preview for **โปรด ก๋วยเตี๋ยวหมูโบราณ**, eight tables and takeaway. The online Supabase path is implemented but not deployed or connected to external accounts. No App Store application is being built. No feature task remains in progress; this handoff is limited to validation, tooling, documentation and Git preparation.

This folder originally had no `.git`, remote or commit author. Git is now configured for [yanapat-tae/Prod-Noodle](https://github.com/yanapat-tae/Prod-Noodle), branch `main`, with the user-provided author email. The remote was empty when checked, so there is no prior remote history to replace. Application and handoff work are separated into logical commits. Use `git status --short --branch`, `git log -1 --oneline`, and `git ls-remote origin refs/heads/main` to verify the current local/remote revision. Cloud environment setup is still separate from repository preparation.

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
- Handoff tooling: pinned Node/pnpm, full typecheck/lint/check scripts, ESLint configuration, portable dependency installer and secret-safe example environment.

## Partially completed / intentionally deferred

- Supabase: schema/RPC/Edge adapters are ready for integration validation; actual Auth, PostgREST, Deno, WebSockets and deploy execution have not been tested.
- Hosting: Cloudflare Pages configuration is present; no live website or public QR URL exists.
- PWA: build assets exist; real iOS/Android installation, offline/reconnect and 200% text zoom are unverified.
- Menu: only fourteen starter entries; recipe/pricing confirmation and remaining menu transcription are needed.
- Voice: Thai prompt/schema examples only, no endpoint or AI calls. Photos, direct delivery APIs, automatic payment verification, split payments, native XLSX and new-menu/account-management/password-reset UI remain deferred.

## Known limitations

- `preview.html` is a mock, with synthetic sales and browser storage, never a shared database. Its direct `file:` opening has not been tested by Codex's browser tooling. Generated JS syntax and mock API behavior were checked previously. Use a modern browser supporting `crypto.randomUUID` and `structuredClone`.
- Demo API binds localhost only. PIN `1234` is public demo data, not a production credential. Persistent `.local-data/demo.json` stays on the original machine; it contains previous fake test sales and must not be published or treated as actual shop revenue. Fresh clones start empty.
- API does not auto-reload; restart `pnpm dev` after server edits. Node does not read Vite's `.env.local`.
- Dashboard updates when opened or manually refreshed. Delivery summaries cannot supply hourly/item-level breakdowns; missing order count is reported as incomplete.
- A single short SQL advisory lock serializes mutations for one restaurant. No real shared-CPU or lunch-load measurement exists; do not infer free-tier capacity from localhost tests.
- Staff active-order reads fail at 1,000 rows to avoid silent truncation. Long-running operation may need pagination/archive work later.
- Source typechecking uses a Deno shim; PGlite emulates Supabase Auth/roles. These checks are not a hosted integration test.
- `pnpm preview` is a static build preview, not a complete demo backend. Use `pnpm dev` for demo interaction; online builds require correctly configured Supabase services.
- SQL Editor installation does not record CLI migration history. Reconcile history before adopting `supabase db push`; do not rerun migrations against an existing schema blindly.

## Validation during handoff

`pnpm check` passed: frontend/preview and Edge typechecks, lint with zero warnings, all five existing tests, production build and HTML regeneration. A fresh export of all staged source files into a separate directory, with an empty dependency store, installed successfully using `bash scripts/cloud-setup.sh` and passed `pnpm check`. Its lockfile and regenerated HTML match the original byte for byte. This verifies fresh-copy setup on this Mac, not an actual GitHub clone or Linux Cloud run.

The 77 project files total approximately 1.36 MB; the largest is the required standalone HTML preview (705,857 bytes). A staged-content credential-pattern scan found no matches; `.env.example` has only blank public-service fields and safe demo defaults. No real .env files, local sales, dependency caches or build output are included. All four migration/seed files are committed with the application source in `02b9e93`; documentation/setup follow in a separate commit. Whitespace and local documentation-link checks passed. See docs/validation.md for scope. No Linux Cloud execution, real-device or hosted load results are claimed.

## Next recommended task and milestone

First run the same checks in the Cloud environment, then review the existing HTML interface and confirm menu/prices with the owner. The following milestone is an **isolated Supabase + Cloudflare online pilot**, validated on multiple real phones and kitchen/POS tabs, followed by an opt-in free-tier lunch-load measurement. Keep voice, photos and delivery APIs deferred. This handoff does not authorize starting that deployment phase.

Suggested continuation prompt:

> Read HANDOFF.md, README.md and AGENTS.md. Run pnpm check. Continue review/fixes of the existing Thai HTML interface only, retaining large controls and emoji menus. Do not start cloud deployment or new major features until requested. Clearly distinguish demo results from real Supabase/device validation.

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
