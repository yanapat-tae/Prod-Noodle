# ผลตรวจรุ่นทดลอง · 5 ตุลาคม 2026

## Handoff verification · 5 October 2026

- `pnpm install --frozen-lockfile --store-dir .pnpm-store` passed against the updated lockfile.
- `pnpm check` passed: strict frontend/preview and Edge source typechecks, ESLint with zero warnings, all five existing tests, production build and standalone HTML regeneration.
- TypeScript 7 remains the compiler. Added the official TypeScript 6 API compatibility alias for typescript-eslint, which does not support the 7.0 API.
- Lint cleanup removed unused declarations/props only; no new application feature or architecture phase was started.
- Production output: customer JS gzip 77.39 KB; staff/chart/QR chunk gzip 123.27 KB. Standalone preview remains approximately 689 KB.
- Fresh staged-source export into a separate directory with an empty dependency store: `bash scripts/cloud-setup.sh` and `pnpm check` both passed. The lockfile and regenerated HTML match byte for byte. This is a clean-copy check on this Mac, not a GitHub clone or Linux Cloud run.
- Staged audit: 77 files, approximately 1.36 MB total; largest file preview.html is 705,857 bytes. No credential-pattern matches or real .env/local-sales/cache/build files staged. All migrations/seeds and source/doc files are in the index. Whitespace and local documentation links passed.
- No GitHub push, Cloud environment execution, real Supabase/Deno deployment or new device/browser validation is implied by these checks.

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

- ยังไม่มีบัญชี Supabase/Cloudflare ผูกกับโปรเจกต์ ไม่มี cloud deployment หรือผล lunch traffic ของ Free
- PGlite จำลอง auth schema/roles ได้ แต่ไม่แทน Supabase Auth, PostgREST, WebSocket, Deno runtime, cold start หรือ shared CPU จึงยังต้อง integration test บน project จริง
- Production build มี PWA manifest/icons/service worker แต่ยังไม่ได้ตรวจ install/offline บนอุปกรณ์ iOS/Android จริง
- ใช้ rem และไม่ปิด pinch zoom แต่ยังไม่ได้ทดสอบ browser text zoom 200% บนอุปกรณ์จริง
- ใช้เมนูเริ่มต้น 14 รายการ ต้องให้ร้านยืนยันสูตร/ตัวเลือก/ราคา และเพิ่มรายการที่เหลือก่อนใช้จริง

ผลยิง 40 requests นี้วัดความถูกต้องของ demo API บนเครื่อง ไม่ใช้ประมาณขีดจำกัด Supabase หรือรับประกันยอดขายร้าน

[ภาพ Dashboard จากยอดทดลอง](previews/sales-demo.png)
