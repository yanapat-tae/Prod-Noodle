# โปรด · QR Ordering & POS ทดลอง

Web app ภาษาไทยสำหรับร้าน 8 โต๊ะและสั่งกลับบ้าน ใช้ 🍜 แทนรูปอาหาร ไม่มีค่า Voice/AI ในรุ่นนี้

**Current milestone:** local MVP + standalone HTML preview. Supabase integration is implemented but not deployed. Start with [HANDOFF.md](HANDOFF.md) and [AGENTS.md](AGENTS.md) when continuing from another machine or Codex Cloud. This is a web/PWA project, not an App Store app.

GitHub repository: [yanapat-tae/Prod-Noodle](https://github.com/yanapat-tae/Prod-Noodle), branch `main`.

## เปิดดูหน้าตาได้ทันที — HTML ไฟล์เดียว

ดับเบิลคลิก **preview.html** เพื่อเปิดตัวอย่างใน Chrome/Safari ได้เลย ไม่ต้องสมัครบริการ ติดตั้ง Node หรือเปิด server รวมหน้าสั่งอาหาร POS ครัว Dashboard และเมนู 🍜 ตัวอักษรใหญ่ไว้ในไฟล์เดียว

ใช้ปุ่ม “สลับหน้าจอ / โต๊ะ” ด้านบนเพื่อดูหน้าต่าง ๆ ข้อมูลเป็นตัวอย่างในเบราว์เซอร์ ไม่ใช่ออเดอร์จริงและไม่แชร์ข้ามโทรศัพท์ ดู [วิธีใช้ HTML](docs/html-preview.md) สำหรับรายละเอียด

## เปิดทดลองในเครื่อง

ต้องใช้ Node.js 24 (ดู `.nvmrc`) และ pnpm 11.25.0 (ระบุใน `packageManager`)

```sh
npm install --global pnpm@11.25.0
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

- ลูกค้าโต๊ะ 1: http://127.0.0.1:5173/?table=1 (เปลี่ยนเป็น 1–8)
- กลับบ้าน: http://127.0.0.1:5173/?table=takeaway
- POS / ครัว / Dashboard: http://127.0.0.1:5173/admin
- บัญชีทดลอง 4 บัญชี: เลือกชื่อบนหน้าล็อกอิน รหัส `1234`

โหมดเริ่มต้นเป็น **demo ในเครื่อง** ใช้ Node API เป็นข้อมูลกลาง และบันทึกใน `.local-data/demo.json` ครัว/POS ดึงข้อมูลทุก 1 วินาทีเมื่อเปิดหน้าอยู่ ไม่ใช่ฐานข้อมูลบนคลาวด์หรือการรับเงินจริง เซิร์ฟเวอร์ฟังเฉพาะ localhost จึงยังสแกนจากมือถืออีกเครื่องไม่ได้

## สิ่งที่ใช้งานได้

- เมนูเริ่มต้น 14 รายการ: ขนาด เส้น น้ำซุป ท็อปปิ้ง และหมายเหตุที่ร้านกำหนด เมนูนี้เป็นชุดเริ่มทดลอง ต้องตรวจสูตรและราคากับร้านก่อนใช้จริง ยังถอดเมนูจากภาพไม่ครบทั้งหมด
- ลูกค้าสั่งอาหาร ตรวจตะกร้า และดูสถานะ เลขคิว Takeaway แยกตามวัน
- ปุ่มและแถวตัวเลือกสูงอย่างน้อย 56px ตัวอักษรลูกค้าหลัก 20px เว้นช่องกด 12px ใช้ฟอนต์เครื่อง ไม่โหลดรูปหรือฟอนต์ภายนอก
- POS เปิดออเดอร์โต๊ะ/กลับบ้าน ห้องครัวเปลี่ยนสถานะ เปิดเสียงเตือน และปิดรอบโต๊ะ
- แคชเชียร์บันทึกรับเงินเต็มจำนวนด้วยเงินสด หรือยืนยันว่าตรวจรายการ PromptPay แล้ว Owner คืนเงินเต็มจำนวนได้
- ยอดขายรายวัน/เดือน กราฟรายชั่วโมง สัดส่วนช่องทาง 10 เมนูขายดี และ CSV ที่เปิดใน Excel ได้
- Delivery กรอกยอดรายวันหรือนำเข้า CSV; ยอดเดิมของวัน/ช่องทางถูกแทนที่เพื่อไม่บวกซ้ำ ยอดที่ไม่มีจำนวนออเดอร์แสดงว่าข้อมูลไม่ครบ
- Owner เปลี่ยนราคา/สถานะหมด และสร้าง QR โต๊ะ 8 ใบ + Takeaway; รุ่นนี้แก้เมนูที่มีอยู่ ยังไม่มีหน้าสร้างเมนูใหม่
- PWA manifest/icons และ service worker สำหรับ app shell ใน production build; เมื่อเน็ตหลุดจะไม่แสดงว่าส่งออเดอร์สำเร็จโดยไม่ได้รับคำตอบจากเซิร์ฟเวอร์

## เตรียมใช้บริการฟรี

เขียนตัวเชื่อม Supabase พร้อม migrations, transactional RPC, RLS และ Edge Functions แล้ว ใช้ Cloudflare Pages เสิร์ฟ frontend และ Supabase Free เก็บข้อมูล/Auth/Realtime ตาม [แผนทดลองฟรี](docs/free-tier-pilot.md)

ยัง **ไม่ได้ deploy หรือผูกบัญชีคลาวด์** ดู [ขั้นตอนติดตั้งคลาวด์](docs/cloud-setup.md) ก่อนเปิดให้โทรศัพท์หลายเครื่องสแกน QR ห้ามนำ PIN ทดลองไปใช้บนอินเทอร์เน็ต

Voice, รูปอาหาร, Delivery partner API, ตรวจเงินโอนอัตโนมัติ, แบ่งจ่าย และ XLSX โดยตรงยังไม่เปิดในรุ่นนี้ CSV มี BOM ภาษาไทยและเปิดใน Excel ได้

## การตรวจสอบ

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm preview:html
```

ชุดทดสอบครอบคลุมราคา/ตัวเลือก, retry ซ้ำ, ข้าม session, สิทธิ์ Owner/Admin, เปลี่ยนราคาโดยรักษาบิลเดิม, รับเงิน/คืนเงิน/ปิดโต๊ะ, ยอด Delivery และ reporting grain ทดสอบ SQL ด้วย PostgreSQL ผ่าน PGlite ที่จำลองส่วน Auth/Roles ของ Supabase

ทดสอบ burst 40 คำขอพร้อมกันผ่าน HTTP **บนเครื่อง** ตรวจออเดอร์/คิวไม่ซ้ำ ไม่ใช่หลักฐานว่า Supabase Free รองรับช่วงเที่ยงแล้ว ดู [ผลและข้อจำกัด](docs/validation.md) และใช้ `scripts/load-pilot.mjs` บน project ทดลองแยกเพื่อเก็บ p50/p95/error หลัง deploy

## โครงสร้างหลัก

```text
src/                  React UI, authoritative pricing rules สำหรับ demo, API adapter
server/demo.mjs       API ในเครื่อง + ไฟล์ข้อมูลทดลอง
supabase/migrations/  Database schema, RLS, transactional RPC และรายงาน
supabase/functions/   public-api, customer-api, staff-api พร้อม auth guards
supabase/seed.sql      โต๊ะ/หมวด/เส้น
supabase/menu-seed.sql เมนูเริ่มทดลอง 14 รายการ
public/               PWA, icons, Cloudflare headers, CSV ตัวอย่าง
scripts/              เปิด dev server, สร้าง seed/icons, load test
tests/               unit, HTTP integration, PostgreSQL integration
docs/                ออกแบบ/ติดตั้ง/ผลตรวจ/ตัวอย่างหน้าจอ
```

[แบบสถาปัตยกรรมเริ่มต้น](docs/architecture-baseline.md) · [ข้อกำหนดอ่านง่าย](docs/customer-accessibility.md) · [System prompt สำหรับ Voice ในอนาคต](supabase/functions/_shared/voice/system-prompt.th.txt)

## Current architecture

| Mode | UI | Data/authentication | State |
| --- | --- | --- | --- |
| HTML | Shared React UI bundled into `preview.html` | `preview/api.ts`, localStorage, mock staff/sample sales | Working design preview |
| Demo (default) | React + TypeScript + Vite | Node HTTP API, JSON file, four mock staff accounts | Working localhost MVP |
| Online pilot | Vite static build on Cloudflare Pages | Supabase PostgreSQL/Auth/Realtime, three Edge Functions | Implemented, not deployed |

`src/api.ts` selects the demo or Supabase adapter. Online customer sessions are opaque hashed tokens bound to a table visit or takeaway entry; staff use Auth JWTs and active `admins` profiles. Edge handlers check authorization and call transactional SQL RPCs. RLS protects staff reads and prevents direct customer writes. Staff get order/visit updates through Realtime online and polling locally; visible customer pages poll their own orders every 30 seconds.

The server validates prices/options; integer satang and immutable snapshots preserve historical bills. Retry keys prevent duplicate orders. Online payments/refunds use a ledger. Reports use Bangkok business dates, paid orders, refund dates and replacement delivery summaries. The service worker caches the app shell only; it never claims an unsent order succeeded.

## Required environment variables

[.env.example](.env.example) lists every current runtime/load-test variable without credentials. Copy it to ignored `.env.local` for Vite. No external keys are needed for demo, HTML, or tests.

| Variable | Scope | Requirement |
| --- | --- | --- |
| `VITE_APP_MODE` | Frontend | `demo` default; `supabase` for online mode |
| `VITE_SUPABASE_URL` | Frontend | Required only in Supabase mode |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Frontend | Public publishable key; required only in Supabase mode |
| `VITE_ENABLE_VOICE`, `VITE_ENABLE_MENU_PHOTOS` | Frontend | Reserved; keep `false`, no implementation behind these switches |
| `APP_ORIGIN` | Edge secret | Required online, exact frontend origin for CORS and QR URLs |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Edge runtime | Supabase-supplied; privileged key stays server-side |
| `DEMO_STAFF_PIN`, `DEMO_PORT` | Node process | Optional defaults `1234`, `4174` |

Node does not load `.env.local`: export optional demo variables into the shell. Vite's proxy expects port 4174; align the proxy if changing it. `PILOT_*` variables are only for the opt-in load script. `GEMINI_*` are unused future placeholders. Supabase CLI authentication/project reference and hosting credentials are deployment tool configuration, not frontend variables. Never commit real `.env` files, QR/session tokens or sales data; never put privileged secrets in a `VITE_` variable.

## Database setup and migration history

Demo needs no database service; SQL tests use in-memory PGlite. On a new isolated Supabase trial project, run these files through SQL Editor in order:

1. `supabase/migrations/202610050001_initial_schema.sql` — schema, RLS/grants, constraints, views and Realtime publication.
2. `supabase/migrations/202610050002_application_api.sql` — transactional application RPCs, snapshots, retries, import/reporting.
3. `supabase/seed.sql` — eight tables, categories and noodle options.
4. `supabase/menu-seed.sql` — fourteen starter dishes and allowed options.

All four files belong in Git. Apply migrations once; add a new migration for future deployed changes instead of editing applied files. Seeds avoid overwriting owner menu prices and create no accounts, passwords or QR secrets. Disable public signup, create four Auth users and corresponding `admins` profiles, and generate QR entries through the owner UI. [Cloud setup](docs/cloud-setup.md) has the profile SQL and deployment steps. SQL Editor application does not populate CLI migration history automatically; reconcile it before using `supabase db push` later. Local JSON sales are not automatically migrated online.

## Development commands and toolchain

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start Vite 5173 + demo API 4174 |
| `pnpm demo:server` | Demo API alone |
| `pnpm typecheck` | Strict frontend/HTML source + Edge source checks |
| `pnpm check:edge` | Edge source check only; not a Deno runtime test |
| `pnpm lint` | ESLint JS/TS/TSX with zero warnings |
| `pnpm test` | Five existing domain, HTTP and PostgreSQL test groups |
| `pnpm test:db` | PGlite migration/RPC tests only |
| `pnpm build` | Frontend typecheck and build `dist/` |
| `pnpm preview` | Static build preview; use `pnpm dev` for complete demo interaction |
| `pnpm preview:html` | Rebuild the committed standalone HTML artifact |
| `pnpm check` | All checks, production build and HTML regeneration |
| `node scripts/generate-menu-seed.mjs` | Regenerate starter SQL from catalog; review diff |
| `node scripts/load-pilot.mjs` | Opt-in test writes on an isolated trial database |

Use Node 24 and pnpm 11.25.0. The lockfile pins dependencies. TypeScript 7 remains the compiler; the `typescript` alias provides the TypeScript 6 API needed by ESLint. [Microsoft compatibility guidance](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6-0) explains the aliases. Lint is syntactic/static validation; it does not replace runtime tests.

Keep both dev ports free. Restart `pnpm dev` after changing server code; the Node API does not auto-reload. A fresh clone starts with no server orders. The HTML instead contains labeled synthetic samples and separate browser storage. Existing `.local-data/` stays on this Mac and is excluded from Git. Icons are committed; optional icon regeneration uses Python + Pillow, which is not needed for build/tests.

## Deployment and continuation from another machine

The planned hosting remains Cloudflare Pages static frontend + Supabase. Do not publish the demo API or HTML mock as a live POS. Use Node 24, build `pnpm build`, output `dist`, and the Supabase-mode public Vite variables. `public/_redirects` handles SPA routes and `_headers` contains CSP/cache headers. Deploy `public-api`, `customer-api`, `staff-api`, set `APP_ORIGIN`, and configure Auth site/redirect URLs. `verify_jwt=false` relies on explicit handler guards; preserve them.

Before shop use, validate actual QR/session isolation, Auth/RLS, order retries, Realtime, payments/refunds, table lifecycle, import/reporting and real-device PWA behavior. PGlite and source checks do not verify Deno/Auth/PostgREST/WebSockets or shared CPU performance. The single-restaurant mutation lock must be measured before optimization. Staff active-order reads reject a 1,000-row result rather than silently truncating. Use only isolated trial data for load tests. The quota/pricing note is dated; recheck it when deploying.

Clone the repository and enter its root:

```sh
git clone https://github.com/yanapat-tae/Prod-Noodle.git
cd Prod-Noodle
git switch main
```

Install Node 24/pnpm 11.25.0, run `pnpm install --frozen-lockfile`, copy `.env.example` to `.env.local`, then run `pnpm check` and `pnpm dev`. `bash scripts/cloud-setup.sh` is an alternative pinned dependency installer using existing pnpm or npm/npx. All source, SQL, tests, icons, lockfile and HTML must be available in the clone.

For an iPhone-managed Cloud workflow, select the GitHub repository and branch, request Node 24, and use `bash scripts/cloud-setup.sh` as the install command. Validate with `pnpm check`, save/publish the prepared environment and continue from it. Demo needs no application secrets. See [official Cloud environments documentation](https://learn.chatgpt.com/docs/environments/cloud-environments). This handoff does not create a Cloud environment or deploy the restaurant website.

The next recommended work is owner review of the existing HTML interface/menu, then an isolated online pilot and real-device/load validation. Voice/photos/partner APIs remain deferred. The original architecture proposal contains future ideas; this README and HANDOFF describe current implemented behavior.
