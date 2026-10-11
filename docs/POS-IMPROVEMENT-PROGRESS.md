# POS Improvement Progress

Session: 11 October 2026 (Asia/Bangkok). Branch: `fix/pos-bills-permissions-20261011`.
Baseline: `d8b8e4a`; clean Git status. Read AGENTS.md, README.md and HANDOFF.md.

## Scope and implementation decisions

Preserve React/Vite, Supabase, demo and HTML preview. No database reset, seed replay,
bill cleanup, Auth account creation, QR rotation, real-money or production test sales.
Existing `table_sessions` identify a dine-in bill; orders remain separate rounds.
Atomic settlement verifies the displayed unpaid order IDs and total, records one
bill receipt with ledger allocations to each order, and closes the visit. Preserve
historical snapshots, refunds, report grain and existing payment methods. Scan
methods require explicit staff verification; selection alone records no payment.
Use existing owner/admin roles: owner = Full Admin; admin = Staff without menu writes.
Expose database categories as direct wrapping buttons. Give all-menu reorder a
shared global order; category reorder keeps unrelated menu positions unchanged.

## Audit findings

- Live project matches repository: `emjktqzcvgjwtsgysljy`.
- Eleven hosted migrations already applied, including hosted-version mappings in HANDOFF.
- Pay RPC settles one order, while visits support multiple rounds; close is a separate action.
- Reorder UI computes neighbors within each category even in the all-menu view.
- `admins.account_slot` allows only 1..4. Auth has all six requested emails and matching
  four supplied UIDs; only the two existing owners have POS profiles.
- Menu mutations already require active owner at Edge + SQL; authenticated RLS reads
  are read-only and writes/RPCs are server-only. Will verify actual denial tests.
- Verified live exclusion codes/IDs: butterfly-pea-lime (7f061342...), chrysanthemum-tea
  (16bb36be...), longan-juice (a10cb2cc...), soft-drink (43c206f8...), water
  (913116d2...), ice (53a6d869...). Actual names include น้ำอัญชันมะนาว,
  น้ำเก๊กฮวย, น้ำลำไย, น้ำอัดลม - โค้ก, น้ำเปล่า, น้ำแข็งเปล่า.
- grass-jelly (303f2418...) is เฉาก๊วยโบราณ; live prep_notes currently empty.

## Tracking — released result

All seven implementation scopes passed the recorded automated checks and were
released after explicit user approval. PASS is scoped to these checks; actual
password logins, physical iPhone and successful hosted payment transactions remain
NOT TESTED. No real-money/production acceptance transactions were created.

| Task | Verified status | Production evidence / remaining acceptance |
|---|---|---|
| 1 Bill rounds / atomic settlement | PASS (automated) | SQL + Edge deployed; native 8-device races passed; successful hosted settlement NOT TESTED |
| 2 Top-menu exclusions | PASS | Hosted read-only report under all3 Staff identities preserves gross and excludes drinks; ranking unchanged |
| 3 Thai Chuay Thai payment | PASS (automated + guard) | Manual UI/receipt/report tests; hosted unconfirmed scan rejected PT400; successful hosted capture NOT TESTED |
| 4 Six accounts / permissions | PASS | Exact six profiles active/confirmed; owner reads and Staff/RLS/RPC denial checks passed; actual password logins NOT TESTED |
| 5 Direct category buttons | PASS (browser + API) | Chromium390px/cart passed; hosted category endpoint returns6; production assets match; physical iPhone NOT TESTED |
| 6 Grass-jelly note | PASS | Hosted note persisted through fresh API/SQL reads; other fields unchanged |
| 7 Persistent reorder | PASS (automated + readback) | Repeated/category/global/stale/reload tests passed; live sequence preserved, unique positions and catalog/owner reads; hosted owner reorder interaction NOT TESTED |

## Files and migrations

- Bill/payment: `src/bill-payment.ts`, `src/staff/Payment.tsx`, `src/pages/Staff.tsx`,
  `src/staff/Ticket.tsx`, `src/api.ts`, `src/pages/Customer.tsx`, `server/demo.mjs`, `preview/api.ts`.
- Report/catalog/UI: `src/domain.ts`, `src/catalog.ts`, `src/menu-admin.ts`,
  `src/pages/Dashboard.tsx`, `src/pages/MenuEditor.tsx`, `src/pages/Ordering.tsx`,
  `src/staff/Accounts.tsx`; regenerated `preview.html`.
- Edge: `supabase/functions/public-api/index.ts`, `supabase/functions/staff-api/index.ts`.
- `20261011143222_pos_profiles_and_note.sql` **APPLIED**, hosted version
  `20261011145139`, name `pos_profiles_and_note`. Hosted history now thirteen migrations (including the approved bill release below).
  Do not replay this or the eleven earlier migrations/seeds.
- `supabase/operations/20261011_requested_staff_profiles.sql` **EXECUTED ONCE**.
  Exact Auth users already existed; inserted only four missing profiles and renamed
  two existing owners. Reread profiles before any future run; do not duplicate Auth.
- `20261011143223_pos_bill_integrity.sql` **APPLIED ONCE**, hosted version
  `20261011161310`, name `pos_bill_integrity`. Bill receipts, ledger FK, atomic settlement,
  menu order/report/RPC changes are live. Do not replay this migration.
- Added `tests/bill-payment.test.ts`, `tests/pos-bill-db.test.mjs`,
  `tests/pos-improvement.test.ts`, `tests/staff-profiles.test.mjs`,
  `tests/browser/pos-improvement.spec.mjs`, `scripts/test-postgres-concurrency.mjs`.
  Updated demo/menu/browser regressions. Updated HANDOFF/cloud-setup and rollback/report docs.

## Actual verification

- `pnpm check`: PASS, 73/73 Node/PGlite tests, both typechecks, zero-warning lint,
  build and HTML generation. Node24.19.0, pinned pnpm11.25.0 frozen install.
- Full system Chromium suite: **43/43 PASS**, 390×844 mobile checks and no horizontal
  overflow. Bundled Playwright browser was unavailable and download policy denied;
  temporary ignored config uses `/usr/bin/chromium`. No TLS bypass or trust-store edit.
- Native PostgreSQL18.4 disposable localhost DB: **8 independent backend PIDs**,
  duplicate orders=1, concurrent receipt=1, ledger=8000 satang; deterministic
  order-first→payment409 and payment-first→next order new bill both PASS.
  Hosted is PG17; this is not hosted throughput/real-payment acceptance.
- Reviewer caught three regressions (new customer token lost after uncertain POST,
  replay overwriting refunds/status, preview rejecting paid receipts). Fixed and tested;
  final read-only spot review found no concrete remaining blocker.
- Live safe-change readback: all six exact Email/UIDs/profiles active, confirmed,
  names/roles correct; Staff owner guards denied for all3; authenticated table UPDATE
  and owner RPC EXECUTE grants absent. Existing RLS/Edge owner guards retained.
- Historical fingerprint preservation PASS: orders28/items60/options102/payments29/
  visits39/customer sessions19/QR10/menu original fields42/variants63 all unchanged.
  Only grass-jelly prep_notes/revision changed; original functions unchanged.
- New secret-signature scan clean. Supabase advisors retain existing guarded SECURITY
  DEFINER notices, intentional server-only request-table RLS info, and disabled leaked
  password protection. Details/remediation links in the report; no new definer added.
- Physical iPhone/Safari, six actual password logins, real production bill/payment
  transactions and live capacity: **NOT TESTED**. Production assets and read-only APIs verified below.

## Deployment and next action — approved and completed

User approved merge/deploy. PR #7 merged as `b1304e7e12a0a042ad864c907450349b987c8d5f`,
release head `a77f7fa`. No force push or account/profile replay.

- `public-api` v3 and `staff-api` v6 ACTIVE; retrieved deployed source matches local
  entrypoint, deno.json and shared handler exactly. Existing custom auth retained;
  `customer-api` v2 unchanged. New routes are guarded by active Auth profile checks.
- `pos_bill_integrity` applied once as hosted `20261011161310`; table RLS enabled,
  payment RPC executable only by service_role, not anon/authenticated.
- Cloudflare Production deployment `999da28a-d08a-4960-b23d-ece4a84f805e` SUCCESS,
  branch main / merge b1304e7. `/`, `/admin`, manifest and SW HTTP200. Served HTML and
  all four JS/CSS files exactly match the production-configured build (public variables only).
- Fresh merged-tree pnpm check:73/73 + typechecks/lint/build/HTML PASS. UI source is
  unchanged from 43/43 browser tests; prior native8-connection races remain applicable.
- Pre/post existing-row hashes preserved across11 tables: orders28, items60,
  options102, payments29, status events55, visits39, customer sessions19, QR10,
  variants63, menu original fields42, profiles6. No new rows or financial writes.
  Global sort/revision initialization is intentional; prior visible41-menu sequence
  remains identical, positions unique, prep note unchanged and owner catalogs readable.
- Hosted READ ONLY checks: all3 Staff can read reports and receipts, excluded drinks
  absent from top and gross matches existing sales events, Thai payment method present.
  Staff owner RPC EXECUTE denied; nonstaff RLS exposes no orders and report returns403;
  all3 owners pass menu catalog guards. Unconfirmed Thai scan returnsPT400 before writes.
- HTTP checks: public catalog/category200, unauthenticated payment/menu401,
  untrusted origin403, valid preflight204. No paid/accepted production test order used.
- Supabase security advisors unchanged: existing guarded definer notices,
  server-only request-table RLS info and disabled leaked-password protection.

Staff must refresh existing POS tabs to receive the new combined-bill UI; legacy
single-order dine-in payment deliberately returns409. Owner should verify six real
logins and physical iPhone/Safari, then coordinate any live order/payment acceptance
with staff/kitchen. Real-money tests remain unapproved and NOT TESTED.

[Thai report and committed evidence](reports/2026-10-11-pos-improvement.md).
[Rollback](POS-ROLLBACK.md) preserves populated receipts/ledger and later owner edits.
Private pre/post snapshots and prior Edge source are in ignored
`.local-data/pos-improvement/`; never commit secrets or raw sales exports.

Implementation3b40e2b, evidence009aed9, approved releasea77f7fa,
[merged PR #7](https://github.com/yanapat-tae/Prod-Noodle/pull/7), merge b1304e7.
This documentation commit records the verified release. Cloudflare may automatically
redeploy documentation-only follow-ups; application assets are unchanged.
