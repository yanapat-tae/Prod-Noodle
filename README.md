# โปรด · QR Ordering & POS ทดลอง

Web app ภาษาไทยสำหรับร้าน 8 โต๊ะและสั่งกลับบ้าน ใช้ 🍜 แทนรูปอาหาร ไม่มีค่า Voice/AI ในรุ่นนี้

**Current milestone:** the online pilot includes one-step kitchen completion, “น้ำอัดลม - โค้ก”, distinct order/payment alert tones, ten persistent QR links and safe same-request order retries. The follow-up code review is deployed on 10 October: it hardens staff refresh/audio races and groups staff code into focused files; see [HANDOFF.md](HANDOFF.md) for validation and deployment status and [the review report](docs/reports/2026-10-10-code-review.md) for findings. The owner reported clearing 26 old test bills on 10 October; new orders have since been observed. **Do not repeat cleanup.** Start with HANDOFF.md and [AGENTS.md](AGENTS.md). This is a web/PWA project, not an App Store app.

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

- เมนูจากภาพร้าน 38 รายการ 58 ขนาด จัด 6 หมวด พร้อมค้นหา ขนาด เส้น น้ำซุป ท็อปปิ้ง และโน้ตอิสระรายจาน ดู [ราคาและรายการครบ](docs/menu-review.md)
- ลูกค้าสั่งอาหาร ตรวจตะกร้า และดูสถานะ กลับบ้านต้องใส่ชื่อ แสดง “กลับบ้าน-ชื่อ” พร้อมเลขคิวแยกตามวัน
- ติ๊กส่งหมู่บ้านเศรษฐสิริ วงแหวน-สุขาภิบาล2 แล้วต้องกรอกบ้านเลขที่/ซอยและเบอร์โทร ข้อมูลส่งต่อถึง POS/ครัว เป็นบริการส่งของร้าน ไม่มีการเชื่อมแพลตฟอร์ม Delivery
- ปุ่มและแถวตัวเลือกสูงอย่างน้อย 56px ตัวอักษรลูกค้าหลัก 20px เว้นช่องกด 12px ใช้ฟอนต์เครื่อง ไม่โหลดรูปหรือฟอนต์ภายนอก
- POS เปิดออเดอร์โต๊ะ/กลับบ้าน ห้องครัวเปิดเสียงเตือน และปิดรอบโต๊ะ มีปุ่ม “เสร็จ/เสิร์ฟแล้ว” ครั้งเดียวจากออเดอร์ใหม่/กำลังทำ/พร้อมเสิร์ฟ เมื่อสำเร็จบิลออกจากครัว แต่บิลที่ยังไม่จ่ายยังอยู่ใน POS รับชำระได้ (เผยแพร่บนเว็บจริงแล้ว 10 ต.ค. 2026)
- เปิดเสียงแจ้งเตือนและลองฟังได้: กระดิ่งสองจังหวะเมื่อออเดอร์เข้า และเสียงไล่โน้ตเมื่อบันทึกรับเงินสด/ยืนยันตรวจยอด PromptPay สำเร็จบนเครื่องที่กดยืนยัน ปรับเสียงสื่อของเครื่องและเปิดหน้าเว็บไว้
- แคชเชียร์บันทึกรับเงินเต็มจำนวนด้วยเงินสด หรือยืนยันว่าตรวจรายการ PromptPay แล้ว Owner คืนเงินเต็มจำนวนได้
- ยอดขายรายวัน/เดือน กราฟรายชั่วโมง สัดส่วนช่องทาง 10 เมนูขายดี และ CSV ที่เปิดใน Excel ได้
- Delivery กรอกยอดรายวันหรือนำเข้า CSV; ยอดเดิมของวัน/ช่องทางถูกแทนที่เพื่อไม่บวกซ้ำ ยอดที่ไม่มีจำนวนออเดอร์แสดงว่าข้อมูลไม่ครบ
- Owner แก้ชื่อเมนูเดิมหรือเพิ่มเมนูใหม่พร้อมขนาด/ราคา เลือกหมวดและกลุ่มตัวเลือกที่มีอยู่ เปลี่ยนราคา/สถานะหมด และเปิดดู QR คงเดิม 10 ใบ: โต๊ะ 8 ใบ, กลับบ้านหน้าร้าน 1 ใบ, สั่งล่วงหน้า/ส่งใน LINE 1 ใบ มีปุ่มคัดลอกลิงก์และเปลี่ยนเฉพาะใบโดย Owner
- หากส่งออเดอร์แล้วไม่ทราบผล จะเก็บตะกร้าเดิมไว้และให้ลองส่งด้วยรหัสเดิมเพื่อป้องกันบิลซ้ำ รวมถึงหลังโหลดหน้าใหม่
- PWA manifest/icons และ service worker สำหรับ app shell ใน production build; เมื่อเน็ตหลุดจะไม่แสดงว่าส่งออเดอร์สำเร็จโดยไม่ได้รับคำตอบจากเซิร์ฟเวอร์

## เตรียมใช้บริการฟรี

เขียนตัวเชื่อม Supabase พร้อม migrations, transactional RPC, RLS และ Edge Functions แล้ว ใช้ Cloudflare Pages เสิร์ฟ frontend และ Supabase Free เก็บข้อมูล/Auth/Realtime ตาม [แผนทดลองฟรี](docs/free-tier-pilot.md)

ลงฐานข้อมูลและ Owner แล้ว พร้อม deploy Edge Functions 3 ตัวและเว็บ https://prod-noodle.pages.dev; ตรวจ public menu API และ CORS ผ่านแล้ว (9 ต.ค. 2026) ไม่มี environment variable ใหม่สำหรับฟีเจอร์รอบนี้ ดู [ขั้นตอนติดตั้งคลาวด์](docs/cloud-setup.md) ก่อนเปิดให้โทรศัพท์หลายเครื่องสแกน QR ห้ามนำ PIN ทดลองไปใช้บนอินเทอร์เน็ต

Voice, รูปอาหาร, Delivery partner API, ตรวจเงินโอนอัตโนมัติ, แบ่งจ่าย และ XLSX โดยตรงยังไม่เปิดในรุ่นนี้ CSV มี BOM ภาษาไทยและเปิดใน Excel ได้

ความต้องการเสียงล่าสุด: “จ่ายเงิน [ยอด] บาทแล้ว” หลังยืนยันเงินเข้าจริงจากกสิกร ร้านใช้ K PLUS บน iPhone เว็บไม่สามารถอ่านแจ้งเตือนของแอป K PLUS ได้โดยตรง ต้องมีช่องทางยืนยันจากระบบรับชำระของธนาคาร เช่น API/webhook ก่อนทำฟีเจอร์นี้ เสียงพูดยังเลื่อนไว้ ส่วนเสียงแจ้งเตือนสั้นหลังพนักงานยืนยันเงินสด/PromptPay ได้เพิ่มตามคำขอใหม่ ระบบยังไม่มีการตรวจเงินโอนอัตโนมัติ

## การตรวจสอบ

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm preview:html
```

ชุดทดสอบครอบคลุมราคา/ตัวเลือก, retry ซ้ำ, ข้าม session, สิทธิ์ Owner/Admin, เปลี่ยนราคาโดยรักษาบิลเดิม, รับเงิน/คืนเงิน/ปิดโต๊ะ, ยอด Delivery และ reporting grain ทดสอบ SQL ด้วย PostgreSQL ผ่าน PGlite ที่จำลองส่วน Auth/Roles ของ Supabase

ทดสอบ dashboard, กลับบ้าน/ส่งหมู่บ้าน และหน้าเพิ่มเมนูใน Chromium เพิ่มเติม (ติดตั้ง browser ครั้งแรก):

```sh
pnpm exec playwright install chromium --only-shell
pnpm test:browser
```

ชุด browser tests เปิด Vite ที่ `127.0.0.1:5175` และใช้ข้อมูล API จำลอง ไม่ต้องใช้บัญชีหรือฐานข้อมูลจริง ตรวจวัน/เดือนใน CSV, โหลดล้มเหลว/ลองใหม่, วันที่ว่าง, ผลตอบกลับที่มาผิดลำดับ, ชื่อ/ที่อยู่/เบอร์ที่ต้องกรอก, โน้ต และเพิ่มเมนูซ้ำอย่างปลอดภัย รายงานและปุ่มส่งออกจะรอข้อมูลของช่วงที่เลือก แทนการใช้ยอดจากช่วงก่อนหน้า ชุดนี้แยกจาก `pnpm check` เพราะต้องติดตั้ง browser ก่อน; ใช้ทั้งสองคำสั่งเมื่อตรวจการแก้ dashboard

ทดสอบ burst 40 คำขอพร้อมกันผ่าน HTTP **บนเครื่อง** ตรวจออเดอร์/คิวไม่ซ้ำ ไม่ใช่หลักฐานว่า Supabase Free รองรับช่วงเที่ยงแล้ว ดู [ผลและข้อจำกัด](docs/validation.md) และใช้ `scripts/load-pilot.mjs` บน project ทดลองแยกเพื่อเก็บ p50/p95/error หลัง deploy

## โครงสร้างหลัก

```text
src/                  React UI, authoritative pricing rules สำหรับ demo, API adapter
src/staff/            Staff components, sound/QR helpers, session-safe state updates
server/demo.mjs       API ในเครื่อง + ไฟล์ข้อมูลทดลอง
supabase/migrations/  Database schema, RLS, transactional RPC และรายงาน
supabase/functions/   public-api, customer-api, staff-api พร้อม auth guards
supabase/seed.sql      โต๊ะ/หมวด/เส้น
supabase/menu-seed.sql เมนูร้าน 38 รายการ (seed ไม่ทับราคาเดิม)
public/               PWA, icons, Cloudflare headers, CSV ตัวอย่าง
scripts/              เปิด dev server, สร้าง seed/icons, load test
tests/               unit, HTTP integration, PostgreSQL integration
docs/                ออกแบบ/ติดตั้ง/ผลตรวจ/ตัวอย่างหน้าจอ
```

[โครงสร้างไฟล์ปัจจุบัน](docs/project-structure.md) · [แบบสถาปัตยกรรมเริ่มต้น](docs/architecture-baseline.md) · [ข้อกำหนดอ่านง่าย](docs/customer-accessibility.md) · [System prompt สำหรับ Voice ในอนาคต](supabase/functions/_shared/voice/system-prompt.th.txt)

## Current architecture

| Mode | UI | Data/authentication | State |
| --- | --- | --- | --- |
| HTML | Shared React UI bundled into `preview.html` | `preview/api.ts`, localStorage, mock staff/sample sales | Working design preview |
| Demo (default) | React + TypeScript + Vite | Node HTTP API, JSON file, four mock staff accounts | Working localhost MVP |
| Online pilot | Vite static build on Cloudflare Pages | Supabase PostgreSQL/Auth/Realtime, three Edge Functions | Deployed; configuration probes pass, real-device acceptance pending |

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

Node does not load `.env.local`: export optional demo variables into the shell. Vite's proxy expects port 4174; align the proxy if changing it. `PILOT_*` variables are only for the opt-in load script. `TABLE_TEST_*` variables configure the separately authorized eight-table test; see its [report and usage](docs/reports/2026-10-09-eight-table-test.md). `GEMINI_*` are unused future placeholders. Supabase CLI authentication/project reference and hosting credentials are deployment tool configuration, not frontend variables. Never commit real `.env` files, QR/session tokens or sales data; never put privileged secrets in a `VITE_` variable.

## Database setup and migration history

Demo needs no database service; SQL tests use in-memory PGlite. On a **new isolated Supabase project only**, use this order: first the two initial migrations, then `supabase/seed.sql` and `supabase/menu-seed.sql`, then all remaining migrations in filename order. Later data migrations depend on those seeded tables/menu rows. The tracked migrations are:

- `202610050001_initial_schema.sql` — schema, RLS, constraints, views and Realtime.
- `202610050002_application_api.sql` — transactional RPCs, snapshots, retries and reporting.

**Run `seed.sql`, then `menu-seed.sql` here before continuing:**

- `20261008041620_order_details_and_menu_creation.sql` — optional legacy-compatible takeaway snapshots, free kitchen notes and owner-only menu creation.
- `20261008041631_owner_menu_catalog.sql` — owner menu/prices and six categories, preserving historic order snapshots and retired rows.

- `20261009112857_owner_menu_rename.sql` — optional owner menu rename, retaining legacy callers and historical snapshots.
- `20261009113319_owner_menu_corrections.sql` — targeted hotpot/ice-cream/rice-option corrections; custom dishes retained.
- `20261010034022_one_step_kitchen_completion.sql` — applied on 10 October: allows `new`/`preparing`/`ready` directly to `served`, retaining legacy transitions, payment/refund behavior and service-only RPC permissions. Changes the function only; does not modify existing bills or table sessions.

- `20261010090132_coke_menu_name.sql` — applied on 10 October: changes only the soft-drink name to “น้ำอัดลม - โค้ก”.
- `20261010090139_persistent_ordering_qr.sql` — applied on 10 October: preserves existing printed QR hashes, adds durable display links and a remote takeaway point, with owner-only individual rotation.

For the existing online pilot, all nine migrations are already applied; do not rerun seeds or initial migrations. The first two hosted migration versions differ from the repository filenames; see HANDOFF.md before using CLI `db push`.
All migrations and seeds belong in Git. Apply migrations once; add a new migration for future deployed changes instead of editing applied files. Seeds avoid overwriting owner menu prices and create no accounts, passwords or QR secrets. The last QR migration creates ten persistent entries. Disable public signup, create an owner Auth user/profile and up to three staff profiles as needed, and view the QR links through the owner UI. [Cloud setup](docs/cloud-setup.md) has the profile SQL and deployment steps. SQL Editor application does not populate CLI migration history automatically; reconcile it before using `supabase db push` later. Local JSON sales are not automatically migrated online.

## Development commands and toolchain

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start Vite 5173 + demo API 4174 |
| `pnpm demo:server` | Demo API alone |
| `pnpm typecheck` | Strict frontend/HTML source + Edge source checks |
| `pnpm check:edge` | Edge source check only; not a Deno runtime test |
| `pnpm lint` | ESLint JS/TS/TSX with zero warnings |
| `pnpm test` | Domain, HTTP, catalog, PostgreSQL and staff state/audio regressions |
| `pnpm test:db` | PGlite migration/RPC tests only |
| `pnpm test:browser` | Chromium dashboard, kitchen/POS, takeaway, retry, menu, QR, sound and session regressions using controlled API responses |
| `pnpm build` | Frontend typecheck and build `dist/` |
| `pnpm preview` | Static build preview; use `pnpm dev` for complete demo interaction |
| `pnpm preview:html` | Rebuild the committed standalone HTML artifact |
| `pnpm check` | Typecheck, lint, Node/PGlite tests, production build and HTML regeneration; browser tests run separately |
| `node scripts/generate-menu-seed.mjs` | Regenerate starter SQL from catalog; review diff |
| `node scripts/load-pilot.mjs` | Opt-in test writes on an isolated trial database |
| `node scripts/test-all-tables.mjs prepare` | Prepare an authorized eight-table/five-dish test; see report for private session setup and run command |

Use Node 24 and pnpm 11.25.0. The lockfile pins dependencies. TypeScript 7 remains the compiler; the `typescript` alias provides the TypeScript 6 API needed by ESLint. [Microsoft compatibility guidance](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6-0) explains the aliases. Lint is syntactic/static validation; it does not replace runtime tests.

Keep both dev ports free. Restart `pnpm dev` after changing server code; the Node API does not auto-reload. A fresh clone starts with no server orders. The HTML instead contains labeled synthetic samples and separate browser storage. Existing `.local-data/` stays on the local machine and is excluded from Git. Catalog version upgrades retain custom dishes and edited prices; order snapshots remain unchanged. Icons are committed; optional icon regeneration uses Python + Pillow, which is not needed for build/tests.

## Deployment and continuation from another machine

Hosting uses Cloudflare Pages static frontend + Supabase. Do not publish the demo API or HTML mock as a live POS. Use Node 24, build `pnpm build`, output `dist`, and the Supabase-mode public Vite variables. Cloudflare Pages supplies SPA fallback; the legacy wildcard in `public/_redirects` currently produces an ignored-loop warning. `_headers` contains CSP/cache headers. Deploy `public-api`, `customer-api`, `staff-api`, set `APP_ORIGIN`, and configure Auth site/redirect URLs. `verify_jwt=false` relies on explicit handler guards; preserve them.

Before shop use, validate actual QR/session isolation, Auth/RLS, order retries, Realtime, payments/refunds, table lifecycle, import/reporting and real-device PWA behavior. PGlite and source checks do not verify Deno/Auth/PostgREST/WebSockets or shared CPU performance. The single-restaurant mutation lock must be measured before optimization. Staff active-order reads reject a 1,000-row result rather than silently truncating. Use only isolated trial data for load tests. The quota/pricing note is dated; recheck it when deploying.

Clone the repository and enter its root:

```sh
git clone https://github.com/yanapat-tae/Prod-Noodle.git
cd Prod-Noodle
git switch main
```

Install Node 24/pnpm 11.25.0, run `pnpm install --frozen-lockfile`, copy `.env.example` to `.env.local`, then run `pnpm check` and `pnpm dev`. `bash scripts/cloud-setup.sh` is an alternative pinned dependency installer using existing pnpm or npm/npx. All source, SQL, tests, icons, lockfile and HTML must be available in the clone.

For an iPhone-managed Cloud workflow, select the GitHub repository and branch, request Node 24, and use `bash scripts/cloud-setup.sh` as the install command. Validate with `pnpm check`, save/publish the prepared environment and continue from it. Demo needs no application secrets. See [official Cloud environments documentation](https://learn.chatgpt.com/docs/environments/cloud-environments). This handoff does not create a Cloud environment or deploy the restaurant website.

The next recommended work is real-device acceptance of the deployed online pilot: QR ordering, uncertain-submit recovery, kitchen/POS Realtime and PWA behavior. The bounded eight-table API test passed; sustained load requires a separate trial project. Voice/photos/partner APIs remain deferred. The original architecture proposal contains future ideas; this README and HANDOFF describe current implemented behavior.
