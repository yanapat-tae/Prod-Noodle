# Service Usage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Give the owner a truthful bar-based view of Supabase and Cloudflare usage and deploy it.

**Architecture:** Extend existing owner navigation and staff API; current DB/Storage sizes come from a guarded RPC, Cloudflare counters from provider snapshots collected with existing environment credentials. Unsupported monthly billing metrics remain explicitly unavailable.

**Tech Stack:** React/TypeScript/Vite, Node 24, pnpm 11.25.0, Supabase PostgreSQL/Edge, PGlite and Playwright; no new application dependency.

**Spec:** `docs/superpowers/specs/2026-10-13-service-usage.md`

## Global Constraints

- Retain Thai Accessible Simple UI and verify 390/430px mobile layouts.
- Preserve all-staff QR viewing, six accounts, orders, payments, menu data and historical snapshots.
- Secrets remain in authorized execution environments; no VITE_ management tokens or hosted PAT copying.
- Only a new migration and monitoring snapshot writes; no existing migration/seed replay.
- User explicitly instructed both providers then deploy; continue through release without reconfirmation.

## Review Focus

- Unknown/partial provider values must not appear as 0% (Task 1).
- Month rollover, stale snapshots and future timestamps must not imply current usage (Task 1).
- Failed pagination must not publish a complete account build count (Task 2).
- Staff and anonymous requests must be denied on both read paths (Task 3).
- Provider failure or late response must not show a previous owner's data or false refresh success (Task 4).

### Task 1: Usage contract and normalization

Files: create `src/service-usage.ts`, `tests/service-usage.test.ts`.

Interfaces: `RawServiceUsage`, `UsageMetric`, `UsageProvider`, `ServiceUsageReport`; `serviceUsageReport(raw, now)`, `usageProgress(metric)`, `demoServiceUsage(now)`.

- [x] Write regressions for measured zero vs null, invalid/future timestamps, stale snapshots, previous month, missing Storage size, over-100% usage and two-provider coverage.
- [x] Run `node --test tests/service-usage.test.ts`; expect missing-module failure before implementation.
- [x] Implement strict normalization, exact quotas and example-only demo data.
- [x] Run the new tests; expect all pass.

### Task 2: Cloudflare collection and snapshot synchronization

Files: create `scripts/sync-service-usage.mjs`, `tests/service-usage-collector.test.mjs`.

Interfaces: `collectCloudflareUsage({accountId,now,fetchJson})` produces sanitized `{observedAt,periodStart,periodEnd,builds,projects,usesFunctions}` snapshots; CLI reads credentials from environment and publishes snapshots via Management API.

- [x] Test multiple projects/pages, failed/cancelled builds, current UTC month, duplicate deployment IDs and incomplete/failed pagination.
- [x] Run collector tests; expect feature missing.
- [x] Implement bounded pagination, request timeout, safe diagnostics and credential-free payloads.
- [x] Verify collector tests and an actual read-only Cloudflare collection.

### Task 3: Guarded database, Edge and demo API

Files: new migration, `supabase/functions/staff-api/index.ts`, `src/api.ts`, `server/demo.mjs`, `preview/api.ts`; `tests/service-usage-db.test.mjs`, `tests/service-usage-api.test.mjs`.

Interfaces: `owner_service_usage(p_actor uuid)` returns `RawServiceUsage`; `api.serviceUsage(identity)` calls `GET /staff/usage`.

- [x] Write owner/staff/anonymous denial tests, RLS/grants and missing-storage metadata tests.
- [x] Run targeted tests; expect missing endpoint/RPC failure.
- [x] Create migration with service-only table/RPC and existing owner checks; add Edge and demo adapters.
- [x] Verify targeted tests and Edge typecheck.

### Task 4: Owner Usage page and release

Files: `src/staff/ServiceUsage.tsx`, `src/styles/service-usage.css`, `src/pages/Staff.tsx`, `tests/browser/service-usage.spec.mjs`; regenerate `preview.html`; update README/HANDOFF and deployment report.

- [x] Write browser regressions for both providers, warning/unknown/unlimited states, refresh failure, denied staff navigation and 390/430px layout.
- [x] Run them before adding the UI; expect missing tab.
- [x] Build accessible bars and per-metric source/time/period labels with guarded refresh and no background polling.
- [x] Run pnpm check and browser suite; review the branch with a fresh reviewer.
- [x] Apply the new migration only, deploy staff API, merge/release frontend, synchronize provider snapshot and verify hosted output.

## Execution ledger

2026-10-13: User approved both providers then deployment. Local checkout updated to live `origin/main` (`d844f10`) before implementation, preserving the 12 October sales-history and staff-QR releases. Work is on `feat/provider-usage-20261013`. Cloudflare current account/project verified; monthly Supabase counters are unavailable through the tested supported authentication path. Snapshot refresh is deliberately timestamped and not advertised as continuous provider polling.

- Tasks 1–3: targeted 13/13 tests passed; initial full check 95/95 passed, including lint, typechecks, build and HTML regeneration. Three new UI tests passed at 390/430px, including 200% text sizing.
- Ruling: CLI migration generation was blocked by the managed read-only home directory in the latest CLI and by the older package postinstall. Generated a fresh UTC timestamp filename in the writable repository; deployed history remains untouched. Cost if wrong: filename/history mapping must be reconciled, as for prior releases.
- Ruling: use the installed `/usr/bin/chromium` and the existing local test config. Browser download host is denied by network policy. This verifies Chromium/mobile viewport, not physical iPhone Safari.
- Fresh reviewer found one Important pagination completeness issue. A new regression reproduced successful truncated pages being accepted; collector now validates count, page size, total count/page count and stable totals before publishing. Minor deferred: pending-request logout browser scenario is not separately tested; inspected component unmount/key/generation guards are correct.
- Final verification after review fix: pnpm check **96/96**, full browser rerun **53/53**, production-configured build passed. No model/runtime claims are substituted for live verification.

- Release complete: PR #10 merged; hosted migration/service-role guards verified, staff-api v8 exact-source match, Cloudflare production successful, 13/13 public asset checks matched. Actual dated monitoring values recorded in deployment report.
