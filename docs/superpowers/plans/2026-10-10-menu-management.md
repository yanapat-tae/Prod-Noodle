# Owner Menu Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Let the owner maintain menu order, lifecycle, variants, modifiers and customer copy, including the requested egg and ice-cream changes.

**Architecture:** Extend the existing normalized catalog and transactional RPCs with per-item overrides, ordering, copy and revisions. Reuse shared validation/customer option rendering in React, Node demo and HTML, preserving legacy calls and order snapshots.

**Tech Stack:** React/TypeScript/Vite, Node 24, pnpm 11.25.0, Supabase PostgreSQL/Edge, PGlite and Playwright; no new product dependency.

**Spec:** `docs/superpowers/specs/2026-10-10-menu-management-design.md`

## Global Constraints

- Retain Thai Accessible Simple UI, large customer controls >=56px, iPhone-width verification.
- Integer satang; fried egg +1000; ice cream normal 3000/special 4000; topping maximum 3/4, minimum 0.
- Toppings exactly ถั่วทอง, ฟักทองเชื่อม, มันเชื่อม, ลูกชิด, สับปะรดเชื่อม. Peanuts default included, separately removable and excluded from topping quota.
- Preserve historical bills, prices, user roles, QR links and same-request retries. No production test orders or cleanup.
- Add new migrations; never edit applied SQL. Preserve source catalog's 38 dishes and existing owner-created items.
- User approved the design and explicitly instructed immediate execution; execute inline through validation/deployment without repeating authorization questions.

## Review Focus

- A stale cart or retry after a menu/variant is archived: a new invalid order fails, an already-created exact retry returns its original bill (Tasks 1/2).
- Editing a shared topping affects one dish only; defaults/disabled choices cannot create an impossible selection (Tasks 1/2/4).
- Switching ice cream from large with four toppings to small must require correction and retain choices; optional single choices can be removed (Task 4).
- Delayed save response, double tap and simultaneous owner devices: preserve draft/request identity and reject stale revisions (Tasks 2/3/5).
- Archive all dishes in a category, then create/restore: category list remains usable and public/POS hide archived items (Tasks 2/3/5).

---

### Task 1: Catalog rules and local mutation model

**Files:** modify `src/domain.ts`, `src/catalog.ts`; create `src/menu-admin.ts`, `tests/menu-admin.test.mjs`.

**Interfaces:**
- `CustomerCopy {variantLabel,instructions,notesLabel,notesPlaceholder}`; optional `MenuItem.copy`, `revision`, `archived`, `sortOrder`, `categorySortOrder` preserve old catalog compatibility.
- Optional `Group.enabled`, `Group.limitsByVariant: Record<string,{min,max}>`; optional `Option.enabled`. Missing values retain old behavior.
- `selectionLimits(group: Group, variantCode: string): {min:number,max:number}` in domain; priceLine ignores disabled groups/options and rejects archived menus.
- `MenuDefinition {code,name,category,description,unit,available,copy,variants,groups,prepNotes}` is normalized, bounded plain text with stable codes, variants 1–8, groups <=8, options <=20/group, total required/default selections <=20.
- `MenuAdminCatalog {items:MenuItem[],categories:{code:string,name:string}[]}`.
- `MenuMutation` is `{kind:'save',menu:MenuDefinition,expectedRevision:number}` or `{kind:'archive'|'restore',code:string,expectedRevision:number}` or `{kind:'reorder',category:string,entries:{code:string,revision:number}[]}` (entire active category).
- Export `menuDefinition(item)`, `validateMenuDefinition(input,categories)`, `publicCatalog(items)` and `applyMenuMutation(items,categories,mutation): MenuItem[]`. Pure immutable updates; callers enforce actor/request replay.

- [x] Write regressions: small four toppings rejects; large four passes; peanuts outside quota; disabled/archived choices reject; shared modifier edits leave another item unchanged; stale revision conflicts; reorder exact membership and revision checks; restore preserves data.
- [x] Run `node --test tests/menu-admin.test.mjs` and observe failures.
- [x] Implement typed helpers and validation. Category/order defaults preserve original order; customer copy falls back to existing text. Peanut group has required include/omit choices, default include, explicit omission name reaches snapshots.
- [x] Upgrade ice cream only when local catalog version is older; preserve custom edits/prices on later opens. Add egg to existing matching requested basil dishes, without creating extra starter dishes.
- [x] Run `pnpm test` and typecheck. Commit domain/model changes.

### Task 2: PostgreSQL catalog management and authoritative pricing

**Files:** new `supabase/migrations/20261010*_menu_management.sql`, `supabase/migrations/20261010*_requested_menu_options.sql`; new `tests/menu-admin-db.test.mjs`.

**Interfaces:**
- `owner_menu_catalog(p_actor uuid)` -> MenuAdminCatalog, service-only/invoker with owner check.
- `owner_manage_menu(p_actor uuid,p_request_key uuid,p_payload jsonb)` -> `{ok:true}`; same transaction/advisory lock as order mutations; request log binds actor/key/full JSON, retries return cached success before revision checks.
- Add menu sort/copy/revision, variant sort, group link name/sort/enabled/variant-limits, option link name/sort/enabled. Per-item price override already exists. Keep globally shared group/option labels unchanged when editing links.
- Add owner mutation request table with RLS and service-only access. Menu row update trigger advances revision, including legacy edit RPC.
- Extend catalog JSON with metadata/defaults and deterministic sort. Owner includes archived/disabled entries; public excludes them. Category list comes from categories even if all dishes are archived.
- Replace place_order only as needed for enabled/per-item names/per-variant limits; keep original retry checks, authorization, transactional snapshots and totals.

- [x] Write PGlite tests for owner access, all mutation kinds, conflicting/replayed keys, stale revisions, legacy revision changes, shared option isolation, variant removal, historical snapshots, order retry after archive, and 3/4 topping +1000 egg pricing. Run and observe failure.
- [x] Implement new migration and targeted data migration: ice cream plus live basil codes `menu-842c7cad-52b4-4221-b9fd-37dd2e4344ef` and `menu-cea2ec9a-f037-475c-885e-a4dd03a537da` if present; preserve prices. Fresh seeded DB does not invent owner dishes.
- [x] Run `node --test tests/menu-admin-db.test.mjs tests/database-features.test.mjs tests/qr.test.mjs`. Verify grants and no old migration diffs; commit.

### Task 3: API, Node and HTML integration

**Files:** `src/api.ts`, `server/demo.mjs`, `preview/api.ts`, `supabase/functions/staff-api/index.ts`; tests HTTP/menu admin integrations.

**Interfaces:** `api.menuAdmin(identity): Promise<MenuAdminCatalog>` reads `GET /staff/menu/manage`; `api.manageMenu(identity,mutation,key): Promise<{ok:true}>` posts same path using Idempotency-Key. All adapters expose these identical signatures.

- [x] Write tests for owner-only read/write, repeated request, conflicting actor/payload and refresh after all items are archived. Observe failure.
- [x] Add Edge owner guards before RPC. Node/HTML bind request keys to actor and payload, persist cache only on successful immutable mutation; public menu uses publicCatalog. Legacy edits advance revisions.
- [x] Keep requestJson's uncertainty semantics and old create/edit endpoints working.
- [x] Run HTTP, menu admin and Edge checks, regenerate HTML after API changes; commit.

### Task 4: Shared customer configuration and preview

**Files:** create `src/pages/MenuOptions.tsx`; modify `src/pages/Ordering.tsx`; add `tests/browser/menu-options.spec.mjs`.

**Interfaces:** shared item option component consumes `MenuItem`, renders customer copy and selection limits, and reports a validated `CartInput` to onAdd. Preview mode invokes no order API and uses the same component with a draft catalog item.

- [x] Add browser tests for custom headings/note placeholder, optional egg select/unselect and price, ice cream 3/4 quota and large→small correction, peanut inclusion/omission snapshot, disabled choices, and 390/430px no overflow. Observe failures.
- [x] Extract only selected-item configuration from Ordering; retain existing cart/request recovery code. Display calculated limits; do not silently drop selections. Required single groups use radio; optional single groups use checkbox.
- [x] Run menu-options, takeaway and submit-retry browser tests and typecheck; commit.

### Task 5: Full owner menu editor

**Files:** replace composition in `src/pages/MenuEditor.tsx`; create focused `src/staff/menu/` draft/form/variant/group/copy components; extend `src/styles/menu-editor.css`; update/add `tests/browser/menu-editor.spec.mjs`.

**Interfaces:** consume Task 1 types/validation, Task 3 API and Task 4 preview. Menu list uses owner catalog plus separate category list. Preserve stable variant/group/option codes in drafts and UUID keys for new entries.

- [x] Write browser tests for create/edit full configuration, per-item modifiers/defaults/variant limits, mobile reorder, archive/restore, all-archived category creation, preview text, double submit, lost-response retry and stale revision error with retained draft. Observe failures.
- [x] Implement search/category/archive filters, up/down ordering and unified form. Expose fields from the spec, clear validation, available/enabled toggles and confirm archive. Keep draft while requests fail; reuse request key for unchanged retries; refresh owner/public catalogs after success.
- [x] Run editor/options/browser regressions, typecheck/lint and regenerate HTML; commit.

### Task 6: Review, deploy and handoff

**Files:** README/HANDOFF, menu review and deployment report; ignored deployment helpers only.

- [x] Run `pnpm check` and full Chromium suite. Inspect small/large phone screenshots; resolve regressions.
- [x] Dispatch one fresh whole-branch reviewer per executing-plans; fix important findings with RED→GREEN and relevant/full checks.
- [x] Read hosted migration history and fingerprint protected data. Newer live orders confirmed; no cleanup or mutation.
- [ ] Restore token Edge Functions Read/Write permissions, then deploy only new tested migrations and staff-api. No production test orders, payment actions or QR changes.
- [ ] Push small commits and create/attach a draft PR.
- [ ] After backend deployment, merge tested source and verify Cloudflare success/current assets and public menu/options. Use read-only hosted checks for server rule installation and preservation.
- [ ] Record exact checks/deployment/current commit in README/HANDOFF; final clean Git status and concise acceptance notes.
