# ผลปรับปรุง POS · 11 ตุลาคม 2026

แก้โค้ดของระบบเดิมครบทั้ง 7 ขอบเขต ไม่มีการสร้างระบบใหม่ รีเซ็ตฐานข้อมูล
ล้างบิล หมุน QR สร้าง Auth ซ้ำ หรือทดสอบรับเงินจริง ผล PASS ด้านโค้ดหมายถึง
การทดสอบในระบบแยกเท่านั้น หน้าเว็บ Production และระบบบิลใหม่ยังไม่ได้ Deploy

| งาน | ผลทดสอบจริง | สถานะ Production |
|---|---|---|
| 1 รวมบิลหลายรอบ | PASS: SQL/HTTP/UI + 8 PostgreSQL connections | BLOCKED: รอ release พร้อมกัน |
| 2 เมนูขายดี | PASS: IDs/codes จริง, ไม่ตัดรายได้, คงจัดอันดับเดิม | BLOCKED: report migration/UI ยังไม่เผยแพร่ |
| 3 สแกนไทยช่วยไทย | PASS: ยืนยันแยก, receipt/report, retry ไม่รับเงินซ้ำ | BLOCKED: migration/Edge/UI ยังไม่เผยแพร่ |
| 4 บัญชี/สิทธิ์ | PASS: live Auth UID/profile/SQL guards และ isolated RLS/API/UI | แก้จริงครบ 6; login ด้วยรหัสจริง NOT TESTED |
| 5 ปุ่มหมวดอาหาร | PASS: Chromium 390px filter/cart/no overflow | BLOCKED: UI/category endpoint ยังไม่เผยแพร่ |
| 6 หมายเหตุเฉาก๊วย | PASS: hosted SQL และ API สอง fresh reads | บันทึกจริงถาวรแล้ว |
| 7 จัดลำดับเมนู | PASS: all/category, stale revision, repeated moves/reload | BLOCKED: migration/UI ยังไม่เผยแพร่ |

## Root cause และการแก้

- `table_sessions` มีหลาย order อยู่แล้ว แต่การชำระเดิมคิดทีละ order และปิดโต๊ะแยก
  เพิ่ม receipt ระดับบิล + ledger allocation ให้ทุก order ใน transaction เดียว ใช้
  advisory lock ร่วมกับ place/cancel/refund/close, ตรวจชุด order IDs และยอดที่พนักงานเห็น
  ก่อนรับเงิน ป้องกันอุปกรณ์อื่นเพิ่มรอบ/ยกเลิกระหว่างยืนยัน และ unique constraints
  ป้องกัน receipt ซ้ำ จ่ายครั้งเดียวปิด visit โดยไม่เปลี่ยนสถานะครัว
- เก็บ request key/input ก่อนส่งและข้าม reload; retry คืน receipt เดิม ทั้ง Demo/Preview
  ไม่เขียน snapshot เก่าทับ refund/สถานะล่าสุด Staff refresh ข้อมูลปัจจุบันจาก server
  เซสชันลูกค้าที่ปิดบิลอ่านใบเสร็จเดิมได้ สั่งครั้งใหม่เปิดบิลใหม่ และบันทึก token ใหม่ก่อน POST
- รายงานขายดีกรอง codes ที่ตรวจ ID/ชื่อจากฐานข้อมูลจริง ได้แก่ ice, water, soft-drink,
  longan-juice, butterfly-pea-lime, chrysanthemum-tea เฉพาะ top ranking จำนวนขายและ
  tie-break เดิมคงไว้ รายได้/รายงานช่องทางไม่ตัดรายการเหล่านี้
- เพิ่ม thai_chuay_thai พร้อมเวลาบันทึก/ยอด/สถานะ/ช่องทางใน ledger, bill history และ report
  การเลือกปุ่มไม่บันทึกเงิน ต้องตรวจเงินเข้าจริงและกดยืนยันเอง ไม่มีการเชื่อมธนาคารอัตโนมัติ
- `admins.account_slot` เดิมจำกัด 4 โปรไฟล์ ขยายเป็น 6 ตรวจ Auth email/UID ทุกบัญชี
  ก่อนเพิ่ม POS profile ใช้ owner=Full Admin และ admin=Staff ตามระบบเดิม ไม่มีแก้ผู้ใช้อื่น
- หมวดอาหารเดิมซ่อนใน Dropdown; เปลี่ยนเป็นปุ่ม wrap แสดงทันที โหลด active categories
  จาก DB รวมหมวดว่าง ปุ่มทั้งหมดคงอยู่ ตะกร้าไม่ถูกล้าง
- ปุ่มเลื่อนเดิมหาเพื่อนบ้านในหมวดเดียวแม้หน้ารวมหมวด จึงติดขอบหมวด เพิ่มลำดับกลาง
  รักษาตำแหน่งเดิมเมื่อเริ่ม migration และใช้ขอบเขตหน้ารวม/เฉพาะหมวดให้ตรงทั้ง UI/SQL
  ตรวจสมาชิกครบและ revision ก่อนเขียน ไม่เปลี่ยนราคา/ชื่อ/ตัวเลือก

## Migration และข้อมูลจริง

- `20261011143222_pos_profiles_and_note.sql`: **APPLIED** hosted `20261011145139`
  ชื่อ `pos_profiles_and_note` ขยาย slots และแก้ prep_notes เฉพาะ grass-jelly
  (`303f2418-751b-43ae-b195-1e5526b94245`) เฉาก๊วยโบราณ
- `supabase/operations/20261011_requested_staff_profiles.sql`: **EXECUTED ONCE**
  อ้าง Auth เดิมเท่านั้น มี guard UID/email/occupied slot และ transaction rollback
- `20261011143223_pos_bill_integrity.sql`: **NOT APPLIED** เพิ่ม bill receipt/ledger FK,
  pay RPC, report, catalog ordering, retry/customer receipt behavior; เตรียม release พร้อม Edge/UI
- [แนวทาง rollback](../POS-ROLLBACK.md) รักษา populated receipt/ledger ห้าม reset/drop data
- ก่อน/หลังงานจริง fingerprint ตรงกันทั้ง 9 ชุด: orders 28, items 60, option snapshots 102,
  payments 29, visits 39, customer sessions 19, QR 10, menu original fields 42, variants 63
  ฟังก์ชันเดิมไม่เปลี่ยน และ menu metadata เปลี่ยนเฉพาะ grass-jelly (prep_notes/revision)
  ไม่มีออเดอร์/รายการเงินทดสอบบน Production

| ชื่อ | Email | UID | สิทธิ์ DB / ผล |
|---|---|---|---|
| เต้ | yanapat1999@gmail.com | d5441734-6746-4dd5-beb9-e27c30565901 | owner / active / confirmed |
| ปลั๊ก | pimcharat.c@gmail.com | dfee2d4e-8ab3-4e03-a214-33fceba5a1d6 | owner / active / confirmed |
| พ่อ | sittichaicherdkiattikul@gmail.com | ae815ee5-845e-4159-a649-fe8687254981 | admin / active / confirmed |
| ฟ้า | kyi.27@icloud.com | 3853da58-9bd4-457c-97cf-97e060201954 | admin / active / confirmed |
| พี่ปราง | prang.kantarat@gmail.com | c74251bb-cc92-4f69-ab1c-5614b687947f | owner / active / confirmed |
| แม่ | prang.kantarat@hotmail.com | 74d32d1a-6eaf-4610-8e6d-d14186583baa | admin / active / confirmed |

## หลักฐานและข้อจำกัด

- [pnpm check log](pos-2026-10-11/check.txt): typecheck frontend+Edge, lint zero warnings,
  73/73 unit/integration/PGlite tests, build, generated preview.html ผ่าน
- [Native PostgreSQL](pos-2026-10-11/native-postgres.json): PostgreSQL18.4 แยก localhost,
  8 backend PIDs จริง ออเดอร์ซ้ำเหลือ1 และรับเงินพร้อมกัน receipt1 ledger8000 satang
  race สั่งก่อน→payment409; จ่ายก่อน→คำสั่งใหม่ได้ visit ใหม่ Hosted เป็น PG17 จึงไม่ใช่
  หลักฐานความจุ/transaction acceptance บน hosted production
- [Browser log](pos-2026-10-11/browser.txt): **43/43 ผ่าน** รวม mobile 390px, bill/payment retry, menu reorder และ customer session renewal
- Chromium ใช้ `/usr/bin/chromium` เพราะ Playwright download host ถูก network policy
  ไม่อนุญาต ใช้ temporary config กำหนด executable (ไม่มีเปลี่ยน TLS/trust store)
- ผู้ตรวจแยกพบและยืนยันแก้ customer token rollover, replay overwrite และ Preview closed
  receipt flow แล้ว ไม่มี blocker เพิ่มในการ spot review
- Auth password/login จริงทั้ง6, Safari/iPhone จริง, offline/PWA บนอุปกรณ์จริง และ hosted
  ธุรกรรมเงินจริง: **NOT TESTED** เจ้าของต้องทดสอบ login และหลายอุปกรณ์หลัง release
- Supabase CLI wrapper เขียน home read-only ไม่ได้/รุ่นสำรองไม่มี migration command จึง
  เตรียมไฟล์ timestamp และ apply ผ่าน MCP พร้อมตรวจ hosted history ไม่รัน db push
  Changelog URL ถูก network policy ปฏิเสธ; ใช้ Supabase docs MCP สำหรับ API/security

## Security และงานถัดไป

ตรวจ active profile + owner guards, RLS/table grants, RPC grants, input validation,
immutable money snapshots, idempotency scope, CSV escaping และไม่มี privileged key
เพิ่มใน source/frontend Staff ใช้งาน POS ได้แต่ owner menu catalog/mutation ถูกปฏิเสธ;
authenticated ไม่มี UPDATE menus/prices/categories และไม่มี EXECUTE owner_manage_menu
ทดสอบ denial จริงใน isolated DB และ require_actor จริงบน hosted สำหรับ Staff ทั้ง3

Advisors ยังมีของเดิม: owner_menu_requests เป็น server-only จึงไม่มี public policy,
is_staff/owner QR เป็น SECURITY DEFINER ที่จำกัดสิทธิ์ในตัว ไม่เพิ่ม definer ใหม่
[Leaked password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
ยังปิดอยู่ เจ้าของพิจารณาเปิดหากแพ็กเกจรองรับ ไม่มีการแก้ Auth settings โดยพลการ

งานถัดไป: อนุมัติ coordinated release ตาม PR, apply เฉพาะ bill migration ที่ยังไม่ลง,
deploy staff/public Edge แล้ว frontend, ตรวจ read-only hosted API/assets และให้พนักงาน
Refresh หน้ารับเงินเดิม ทดสอบเงินจริงเฉพาะเมื่อเจ้าของอนุญาตและประสานครัวแล้ว

Git: implementation `3b40e2b`, evidence `009aed9`, branch
`fix/pos-bills-permissions-20261011`, [draft PR #7](https://github.com/yanapat-tae/Prod-Noodle/pull/7).
PR ยังไม่ merge; Edge/Pages Production ไม่ได้ deploy รุ่นนี้ ไม่มี force push
Cloudflare สร้าง branch preview อัตโนมัติหลัง push: deployment
`35f75b2c-c44f-4206-b264-6762a6493488` commit `3dc3960` ผ่าน build
preview นี้ยังใช้ Backend เดิม จึงไม่ใช่ bill acceptance หรือการเผยแพร่ Production
Production canonical deployment `b6ef471a-52b5-4ab5-aa14-492a5894e0c8`
ยังอยู่ main `d8b8e4a`. [Production-configured build](pos-2026-10-11/production-configured-build.txt)
ผ่านโดยใช้ public variables เดิม ไม่มี privileged keys ใน frontend
