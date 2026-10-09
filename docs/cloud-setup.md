# ต่อ Supabase Free และ Cloudflare Pages

สถานะ 9 ต.ค. 2026: project `emjktqzcvgjwtsgysljy` มี Owner, โต๊ะ 8, เมนูออนไลน์ 40 (38 จากภาพร้าน + Owner เพิ่มเอง 2) และหมวด 6 ทั้ง 6 migrations ลงครบ, staff-api รุ่น 4 ACTIVE และ frontend ล่าสุดขึ้น https://prod-noodle.pages.dev แล้ว ทดสอบส่งพร้อมกัน 8 โต๊ะ/40 จานและ retry ผ่าน ดู [รายงาน](reports/2026-10-09-eight-table-test.md) และ HANDOFF.md ห้ามรัน initial migrations ซ้ำ

## 1. สร้าง Supabase project ทดลองแยก

เลือก Free และ region ใกล้ร้าน ใช้ project ทดลองแยกจากข้อมูลขายจริง ไม่เปิด paid plan เพื่อทำขั้นตอนนี้

สำหรับ project ใหม่เท่านั้น: รันทุกไฟล์ใน `supabase/migrations/` ตามชื่อไฟล์ แล้วตามด้วย `supabase/seed.sql` และ `supabase/menu-seed.sql` สำหรับ project ที่ใช้อยู่ให้ apply เฉพาะ migrations ใหม่ที่ยังไม่ลง

สอง migration แรกของ project ปัจจุบันมี version `20261007000812` และ `20261007000819` บน Supabase ซึ่งต่างจากชื่อไฟล์ใน repo ต้องเทียบ migration history ก่อนใช้ CLI `db push` อย่า apply schema เดิมซ้ำ สี่ migration ที่เพิ่มภายหลังใช้ version ตรงกันทั้ง repo/remote: `20261008041620_order_details_and_menu_creation`, `20261008041631_owner_menu_catalog`, `20261009112857_owner_menu_rename` และ `20261009113319_owner_menu_corrections`

Seed ไม่สร้าง QR secrets หรือรหัสผ่าน และไม่ทับราคาที่ Owner แก้ เมนูครบ 38 รายการจากภาพร้าน; ดู [รายการและราคา](menu-review.md) Owner เพิ่มเมนูใหม่ ขนาด ราคา และเลือกกลุ่มตัวเลือกผ่าน UI ได้แล้ว ไม่ต้องแก้ SQL เพื่อเพิ่มอาหาร

เริ่มทดสอบด้วยบัญชี Owner และ profile slot 1 ก่อน แล้วเพิ่มพนักงานใน slot 2–4 เมื่อพร้อม ไม่จำเป็นต้องสร้างบัญชีพนักงานสมมติเพื่อเริ่มทดสอบ

ปิด public signup ใน Auth แล้วสร้างผู้ใช้ 4 บัญชีผ่านหน้า Auth ของ Supabase ให้เจ้าของกำหนดอีเมลและรหัสผ่านเอง จากนั้นเพิ่ม profile (แทน UUID และชื่อให้ตรงผู้ใช้จริง):

```sql
insert into public.admins(auth_user_id,account_slot,display_name,role) values
 ('OWNER_AUTH_UUID',1,'เจ้าของร้าน','owner'),
 ('ADMIN_1_AUTH_UUID',2,'พนักงาน 1','admin'),
 ('ADMIN_2_AUTH_UUID',3,'พนักงาน 2','admin'),
 ('ADMIN_3_AUTH_UUID',4,'พนักงาน 3','admin');
```

ช่อง account_slot 1–4 มี UNIQUE/CHECK บังคับไม่ให้มีเกิน 4 profile รหัสผ่านเก็บใน Supabase Auth เท่านั้น ไม่มีช่องรหัสผ่านในตาราง admins

## 2. Deploy Edge Functions

ใช้ Supabase CLI ของผู้ใช้ หรือ workflow สำหรับ deploy จากบัญชีของเจ้าของโปรเจกต์:

```sh
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase functions deploy public-api
supabase functions deploy customer-api
supabase functions deploy staff-api
```

`supabase/config.toml` กำหนด verify_jwt=false เพราะ public/customer ใช้ QR และ opaque customer token ส่วน staff-api ตรวจ JWT ด้วย `auth.getUser(token)` และ profile ที่ active เองทุกคำขอ ตามแนวทาง [การตรวจ authentication เองใน handler](https://supabase.com/docs/guides/functions/auth)

ตั้ง secret `APP_ORIGIN` เป็น origin ของเว็บ เช่น `https://prod-trial.pages.dev` (ไม่ใส่ trailing path) ใช้ origin เดียวที่ตรงกับหน้าเว็บจริง กรณีทดสอบ Edge จาก local frontend ให้ใช้ `http://127.0.0.1:5173` ชั่วคราวแล้วเปลี่ยนก่อนเปิดเว็บจริง CORS ตรวจ origin ที่ตั้งไว้

Supabase ใส่ SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY ให้ function runtime ตาม [เอกสาร environment variables](https://supabase.com/docs/guides/functions/secrets) ห้ามใส่ service role/secret key ลงตัวแปร VITE_ หรือไฟล์ frontend

แต่ละ function มี deno.json ของตัวเองเพื่อจัด dependency ตอน deploy ตาม [Supabase dependency guide](https://supabase.com/docs/guides/functions/dependencies)

ไม่มีการ deploy Voice endpoint และไม่ต้องมี Gemini API key

## 3. Cloudflare Pages static frontend

ใน Pages เลือก build command `pnpm build`, output directory `dist` และ Node.js 24 ที่รองรับ ใช้ตัวแปร build:

```text
VITE_APP_MODE=supabase
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_PUBLISHABLE_KEY
VITE_ENABLE_VOICE=false
VITE_ENABLE_MENU_PHOTOS=false
```

Frontend มีเฉพาะ publishable key ที่เปิดเผยได้ RLS ไม่ให้ anon อ่าน/เขียน orders โดยตรง Staff อ่านผ่าน JWT/RLS การเขียนทั้งหมดผ่าน guard และ RPC มี _headers สำหรับ CSP ส่วน Pages ใช้ SPA fallback ได้; wildcard เดิมใน _redirects มี warning วนซ้ำและถูก Pages ข้าม

เพิ่ม site URL/redirect URL ของเว็บใน Supabase Auth ตามโดเมนจริง รุ่นนี้เข้าสู่ระบบด้วยอีเมล/รหัสผ่าน ไม่ได้ทำ OAuth หรือ reset-password UI

## 4. ทดลองด้วยมือถือหลายเครื่อง

1. เปิด `/admin` เข้าบัญชี Owner ไป “QR โต๊ะ” กดสร้าง QR แล้วดาวน์โหลดทั้ง 9 ใบ QR ทดลองที่ชี้ localhost ใช้กับมือถืออีกเครื่องไม่ได้
2. บน cloud QR มี token สุ่ม; เก็บเฉพาะ SHA-256 ใน DB สแกนแล้วสร้าง customer session 4 ชั่วโมง ผูกกับรอบโต๊ะ และนำ query QR ออกจาก address bar
3. เปิดครัว/POS 2–4 แท็บ เปิดเสียงด้วยปุ่มครั้งแรก (browser ต้องการการแตะก่อนเล่นเสียง)
4. สแกนโต๊ะ 1 จากโทรศัพท์ 2 เครื่อง สั่งเพิ่มให้อยู่รอบเดียวกัน ตรวจราคาที่ครัว รับชำระ และปิดโต๊ะ ลิงก์ session เก่าต้องสั่งต่อไม่ได้
5. ทดสอบ Takeaway 2 เครื่อง: ต้องใส่ชื่อ เห็น “กลับบ้าน-ชื่อ” และคิวไม่ซ้ำ ติ๊กส่งหมู่บ้านต้องกรอกบ้านเลขที่/ซอยกับเบอร์โทร เขียนโน้ตต่อจานแล้วตรวจที่ครัว ดู [ขั้นตอนตรวจรับ](acceptance-tests.md) เพิ่มเติม
6. ตรวจคืนเงินและรายงาน รวม Delivery รายวัน แล้วนำเข้าไฟล์เดิมซ้ำ ยอดต้องไม่เพิ่ม
7. ทดสอบ PWA บน HTTPS และการหลุดเน็ต ยืนยันว่าตะกร้ายังอยู่ และ UI ไม่บอกว่าส่งสำเร็จหาก server ยังไม่ตอบ

Owner สร้าง QR ใหม่จะเปลี่ยนทั้ง 9 ใบ ต้องพิมพ์ชุดใหม่ Printed QR เป็นทางเข้า ไม่ใช่การยืนยันว่าคนอยู่หน้าร้าน จึงควรหมุน QR หากมีการเผยแพร่ต่อ และใช้ staff ตรวจรายการผิดปกติ

## 5. วัดโหลดบน Free จริง

รันเฉพาะ project ทดลองที่ไม่มีข้อมูลขายจริง สคริปต์สร้างรายการทดสอบโดยไม่รับเงิน:

```sh
export PILOT_ALLOW_WRITE=TEST_DATA_ONLY
export PILOT_MODE=supabase
export PILOT_BASE_URL=https://YOUR_PROJECT_REF.supabase.co
export PILOT_QR_TOKEN=TAKEAWAY_TOKEN_FROM_QR
export PILOT_PUBLISHABLE_KEY=YOUR_PUBLIC_PUBLISHABLE_KEY
export PILOT_WORKERS=20
export PILOT_ORDERS_PER_WORKER=5
node scripts/load-pilot.mjs
```

สคริปต์เก็บเวลาของ menu/session/order เป็น p50/p95/max, error และ ID ที่ต้องตรวจนับใน `.local-data/pilot-load-results.json` รวม retry ออเดอร์แรกของแต่ละ session เพื่อเช็ก duplication ไม่มีการส่งรายงานให้บริการอื่น เริ่ม 20 concurrent แล้วเพิ่มเป็น 50/100 ตาม [แผนวัดช่วงเที่ยง](free-tier-pilot.md) ดูครัวไปพร้อมกันและตรวจยอดจริงใน DB เทียบ unique IDs

RPC รุ่นทดลองใช้ advisory lock เดียวสำหรับ mutation สั้น ๆ ของร้านหนึ่งร้าน เพื่อตรวจราคา/คิว/ปิดโต๊ะแบบ atomic จึงต้องวัด queue latency บน shared CPU จริงก่อนพิจารณาแยก lock หรือเพิ่ม resource ไม่ใช้ผล localhost อ้างความสามารถ Free

Delivery รุ่นนี้เป็น summary ไม่ใช่ partner API และไม่สรุปค่าธรรมเนียมหรือยอดรับเงินจริงจากแพลตฟอร์ม ค่าธรรมเนียมที่ไม่ทราบเก็บ NULL ไม่เติม 0 ให้ดูเหมือนทราบ
