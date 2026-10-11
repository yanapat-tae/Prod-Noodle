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

## Tracking — latest session result

PASS below is explicitly scoped to the recorded tests. All seven scopes were inspected
and implemented; full production acceptance is incomplete until coordinated release.

| Task | Acceptance status | Completed evidence / remaining work |
|---|---|---|
| 1 Bill rounds / atomic settlement | BLOCKED | Local SQL/HTTP/UI PASS; native 8-device races PASS; pending coordinated release |
| 2 Top-menu exclusions | BLOCKED | Verified live identities; isolated report tests PASS; pending report migration/frontend |
| 3 Thai Chuay Thai payment | BLOCKED | Manual confirmation/receipt/report/retry tests PASS; pending migration/Edge/frontend |
| 4 Six accounts / permissions | PASS | Live six exact profiles, active + confirmed; Staff require_actor(owner) denied; no real password logins tested |
| 5 Direct category buttons | BLOCKED | Chromium 390px filter/cart PASS; pending category endpoint/frontend deployment |
| 6 Grass-jelly note | PASS | Live prep_notes updated; two fresh API reads confirm persistence; other fields/variants unchanged |
| 7 Persistent reorder | BLOCKED | SQL revisions/membership and browser repeated moves/reload PASS; pending global-order migration/UI |

## Files and migrations

- Bill/payment: `src/bill-payment.ts`, `src/staff/Payment.tsx`, `src/pages/Staff.tsx`,
  `src/staff/Ticket.tsx`, `src/api.ts`, `src/pages/Customer.tsx`, `server/demo.mjs`, `preview/api.ts`.
- Report/catalog/UI: `src/domain.ts`, `src/catalog.ts`, `src/menu-admin.ts`,
  `src/pages/Dashboard.tsx`, `src/pages/MenuEditor.tsx`, `src/pages/Ordering.tsx`,
  `src/staff/Accounts.tsx`; regenerated `preview.html`.
- Edge: `supabase/functions/public-api/index.ts`, `supabase/functions/staff-api/index.ts`.
- `20261011143222_pos_profiles_and_note.sql` **APPLIED**, hosted version
  `20261011145139`, name `pos_profiles_and_note`. Hosted history now twelve migrations.
  Do not replay this or the eleven earlier migrations/seeds.
- `supabase/operations/20261011_requested_staff_profiles.sql` **EXECUTED ONCE**.
  Exact Auth users already existed; inserted only four missing profiles and renamed
  two existing owners. Reread profiles before any future run; do not duplicate Auth.
- `20261011143223_pos_bill_integrity.sql` **NOT APPLIED**. Bill receipts, ledger FK,
  atomic settlement, menu order/report/RPC changes are staged for coordinated release.
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
  transactions, production new UI and live capacity: **NOT TESTED**.

## Deployment and next action

Only the compatible profile/note migration and exact-profile operation are live.
Bill migration, new Edge handlers and frontend are **NOT DEPLOYED**. Current production
still has the old bill/report/category/reorder behavior. This avoids applying the
legacy-payment rejection before the compatible client/endpoint is available.

Prepare a reviewed PR, then request one coordinated merge/deployment decision;
AGENTS.md treats deployment as a separate task. After approval, reread Git and hosted
history, apply only the pending bill migration, deploy public/staff Edge with existing
custom authentication, publish production-configured frontend, verify hosted reads/
assets, and have existing staff tabs refresh. No real-money tests without authorization.
Owner should test each login and iPhone/Safari; profiles already exist, so do not recreate users.

[Detailed Thai report and evidence](reports/2026-10-11-pos-improvement.md).
[Rollback procedure](POS-ROLLBACK.md) retains receipts/ledger and subsequent owner edits.
Private pre/post snapshots are in ignored `.local-data/pos-improvement/`; do not commit secrets/sales.

Git commit/PR will be recorded after verification and push. No force push or merge performed.
