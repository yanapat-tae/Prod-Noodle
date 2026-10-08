# ผลตรวจรุ่นทดลอง

## Owner menu / takeaway release · 8 October 2026

- `pnpm check`: strict frontend/Edge typecheck, zero-warning lint, 28 Node/PGlite tests, production build and regenerated HTML pass. The new migrations are read from the repository, with no draft-file dependency.
- `pnpm test:browser --workers=2`: 12 Chromium tests pass, covering existing dashboard regressions, required name/address/phone, saved drafts, kitchen note receipts, owner create/retry/validation and existing price editing.
- PGlite checks preserve old bill names/prices while replacing the trial menu, validate service-only RPC grants and reject invalid order/menu input atomically. New migrations retain both original schema files unchanged.
- Hosted Supabase has four applied migrations, 38 active menu items / 58 variants / six categories / eight tables. Before/after update: the same ten orders, 77,500 satang total and identical historical item checksum. No live test order was created.
- Hosted public menu returns 200 with 38 items and Pages CORS; updated staff-api v3 rejects unauthenticated create-menu calls with 401. Frontend code commit `57e04fe` is live: `/` and `/admin` return 200, and published assets include the new forms/menu creation.
- Full authenticated flow, real-phone Realtime/PWA, staff accounts and lunch-load measurements remain acceptance work. See [test steps](acceptance-tests.md).

The dated sections below retain earlier validation history and limitations; they do not override the current release results.

## Linux Cloud continuation · 6 October 2026

- Clean GitHub clone of `main` at `2c03809`; no newer remote branch. Node 24.19.0, pnpm 11.25.0, frozen-lockfile install and the full existing `pnpm check` passed before code changes.
- Reproduced dashboard defects in Chromium before fixing: previous-period CSV export, stale manual refresh totals/errors, empty date handling and returning to a previous period while loading.
- After the fix: `pnpm check` passed frontend/preview/Edge typechecks, zero-warning lint, all five Node/PGlite tests, production build and HTML regeneration. `pnpm test:browser --workers=2` passed all seven dashboard regressions. Independent code review found no actionable issues.
- Browser tests use the real React UI with controlled API responses, including delayed/error responses, and inspect CSV filenames/content. They use no live sales data or Supabase credentials. Install Chromium with `pnpm exec playwright install chromium --only-shell` before running `pnpm test:browser`; Vite uses localhost port 5175. Browser tests run separately from `pnpm check`.
- Initial Git/npm and HTTP checks failed with network/socket EPERM until per-command sandbox network permission was available. These were environment failures. Restricted environments may need a writable `PLAYWRIGHT_BROWSERS_PATH` shared by installation and test commands.
- Supabase hosted Auth/PostgREST/Realtime/Deno, deployment, real phones/PWA installation and free-tier load remain unverified. Existing migrations/seeds and reporting calculations were preserved. The user has a Supabase account; no trial project has been identified or modified by this continuation.

## Historical handoff verification · 5 October 2026

- `pnpm install --frozen-lockfile --store-dir .pnpm-store` passed against the updated lockfile.
- `pnpm check` passed: strict frontend/preview and Edge source typechecks, ESLint with zero warnings, all five existing tests, production build and standalone HTML regeneration.
- TypeScript 7 remains the compiler. Added the official TypeScript 6 API compatibility alias for typescript-eslint, which does not support the 7.0 API.
- Lint cleanup removed unused declarations/props only; no new application feature or architecture phase was started.
- Production output: customer JS gzip 77.39 KB; staff/chart/QR chunk gzip 123.27 KB. Standalone preview remains approximately 689 KB.
- Fresh staged-source export into a separate directory with an empty dependency store: `bash scripts/cloud-setup.sh` and `pnpm check` both passed. The lockfile and regenerated HTML match byte for byte. This is a clean-copy check on this Mac, not a GitHub clone or Linux Cloud run.
- Staged audit: 77 files, approximately 1.36 MB total; largest file preview.html is 705,857 bytes. No credential-pattern matches or real .env/local-sales/cache/build files staged. All migrations/seeds and source/doc files are in the index. Whitespace and local documentation links passed.
- GitHub publication verified: `main` at `99b9657` matched the local commit. A fresh GitHub clone with an empty dependency store passed `bash scripts/cloud-setup.sh` and `pnpm check`; all 77 files and required SQL/environment/docs were present, without tracked private/cache/build data. Later commits only record handoff verification.
- Actual Linux Cloud execution, real Supabase/Deno deployment and new device/browser validation remain unverified.

## ผ่านในเครื่อง

- TypeScript frontend และ Edge Function source ผ่าน strict type check
- Production build ผ่าน: customer JS gzip ประมาณ 77 KB; staff/chart/QR แยก lazy chunk ประมาณ 123 KB ไม่ส่ง chart bundle ให้ลูกค้าตั้งแต่เปิดหน้า
- Node test runner ผ่าน 5 test groups ครอบคลุม validation/pricing, เงินแบบ integer สตางค์, timezone/CSV, รายงาน, HTTP API และ PostgreSQL transactions
- HTTP integration ยิง 40 คำขอพร้อมกันใน temporary demo database: สำเร็จทั้งหมด เลขคิว/ID ไม่ซ้ำ ทดสอบ retry payload เดิมได้ order เดิม payload ต่างใช้ key เดิมได้ 409
- PostgreSQL/PGlite รัน migration/seed จริง; ทดสอบราคาและ snapshots, rollback ออเดอร์ที่ตัวเลือกผิด, grants/RLS, ไม่ให้ customer อ่าน session อื่น, role admin ไม่แก้เมนู, ปิดโต๊ะ revoke session, ledger รับเงิน/คืนเงินไม่ซ้ำ, summary ไม่บวกซ้ำ และรายงานรายวัน
- ตรวจผ่าน browser จริง: เลือกมาม่า +5 → ตะกร้า 55 บาท → ส่งให้ร้าน → ครัวกำลังทำ/พร้อมเสิร์ฟ/ส่งมอบ → รับเงินทดลอง → Dashboard ยอด 55 บาท 1 ออเดอร์
- จอ 320px และ 375px: ไม่มี page horizontal overflow; ตัวอักษรลูกค้า 20px และปุ่มลูกค้าที่ตรวจสูง 56px ขึ้นไป หลังตรวจจัดหมวดอาหารให้พับได้เพื่อเห็นอาหารเร็วขึ้น
- ไม่พบ console error/warning ใน flow ที่ตรวจ

## ยังไม่ได้ยืนยัน

- มี Supabase/Cloudflare deployment แล้ว; ยังไม่มีผล lunch traffic ของ Free
- PGlite จำลอง auth schema/roles ได้ แต่ไม่แทน Supabase Auth, PostgREST, WebSocket, Deno runtime, cold start หรือ shared CPU จึงยังต้อง integration test บน project จริง
- Production build มี PWA manifest/icons/service worker แต่ยังไม่ได้ตรวจ install/offline บนอุปกรณ์ iOS/Android จริง
- ใช้ rem และไม่ปิด pinch zoom แต่ยังไม่ได้ทดสอบ browser text zoom 200% บนอุปกรณ์จริง
- เพิ่มเมนูครบจากภาพร้านแล้ว; ยังต้องทดสอบการใช้งานจริงและตรวจสูตร/ตัวเลือกกับครัว

ผลยิง 40 requests นี้วัดความถูกต้องของ demo API บนเครื่อง ไม่ใช้ประมาณขีดจำกัด Supabase หรือรับประกันยอดขายร้าน

[ภาพ Dashboard จากยอดทดลอง](previews/sales-demo.png)
