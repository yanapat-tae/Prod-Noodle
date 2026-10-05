# แบบสถาปัตยกรรมเริ่มต้น

เอกสารนี้เป็นแบบขั้นแรก บางส่วนเผื่อเฟสถัดไป เช่น แบ่งจ่าย, Voice และ Delivery API ขอบเขตที่เขียนเสร็จจริงและวิธีรันดู README.md และ docs/cloud-setup.md

# โปรด ก๋วยเตี๋ยวหมูโบราณ — แบบระบบขั้นแรก

เอกสารนี้เสนอฐานข้อมูล System Prompt และโครงสร้างโปรเจกต์สำหรับร้านเดียว 8 โต๊ะ + Takeaway + GrabFood + LINE MAN มีบัญชี Owner/Admin รวม 4 บัญชี เป้าหมายรุ่นทดลองคือค่า service 0 บาทภายในโควตาฟรี และทดสอบช่วงเที่ยงด้วยการแตะเลือกเมนูเป็นหลัก Voice ปิดไว้ก่อน ไฟล์ SQL เป็นแบบตั้งต้น ส่วนหน้าจอและ API ในผังยังเป็นแผนพัฒนา ไม่มีเว็บแอปที่รันได้ในขั้นนี้

แผนโควตา ขอบเขต MVP และเกณฑ์ load test อยู่ที่ `docs/free-tier-pilot.md` เลือกจ่ายเฉพาะบริการที่มีผลวัดยืนยันว่าจำเป็น ไม่เปิด paid add-on หรือ AI API ในรุ่นทดลอง

## สถาปัตยกรรมที่เสนอ

ใช้ React + Vite + TypeScript ทำ Customer PWA, POS, Kitchen และ Dashboard เป็น static SPA บน Cloudflare Pages Free ใช้ Supabase Free สำหรับ PostgreSQL, Auth, Realtime และ Edge Functions ที่เรียก transactional RPC ทุกเมนูใช้ emoji 🍜 แทนภาพในรุ่นทดลอง ไม่โหลดรูปอาหาร ใช้ Recharts สำหรับกราฟ ไม่มี SSR หรือ API AI ในรุ่นทดลอง

หน้าลูกค้าใช้ตัวอักษรหลักประมาณ 20px ปุ่ม/ตัวเลือกสูงอย่างน้อย 56px และช่องว่าง 12px เป็นค่าเริ่มต้นสำหรับผู้สูงอายุ รายละเอียดและเกณฑ์ตรวจอยู่ที่ `docs/customer-accessibility.md` พร้อม CSS ตั้งต้นที่ `src/styles/customer-accessibility.css`

Cloudflare Pages ให้ static asset requests ฟรีและไม่จำกัดตาม [Pages Pricing](https://developers.cloudflare.com/pages/functions/pricing/) ส่วน API จะเรียก Supabase Edge Functions จึงต้องติดตามโควตาของ Supabase แยก การเลือก static SPA ช่วยลด service ที่ต้องดูแลและไม่มี server rendering ในทุกการเปิดหน้า

```text
Cloudflare Pages: Customer PWA / POS / Kitchen / Dashboard / emoji 🍜
                  ↓ HTTPS
Supabase Edge Functions: ตรวจ session / ตรวจ catalog / คำนวณราคา
                  ↓ transaction
Supabase PostgreSQL ── Realtime ── POS และ Kitchen ที่ล็อกอิน
       ↓                          ↓
Sales Views → Dashboard/Export    เปลี่ยนสถานะผ่าน API
       ↑
Delivery: ยอดรายวัน/CSV; Voice และ vendor API เป็นส่วนเสริมภายหลัง
```

Customer API ใช้ opaque session token แบบอายุสั้น อ่านเฉพาะออเดอร์ของ session นั้น ส่งผ่าน Authorization header และเก็บใน memory/sessionStorage ของแท็บ ไม่ใส่ token ใน URL หลัง bootstrap เพื่อรองรับ Pages และ Edge Functions ที่อยู่คนละ origin โดยไม่พึ่ง third-party cookie ลูกค้าไม่เชื่อมฐานข้อมูลหรือ subscribe ออเดอร์ทั้งร้านโดยตรง Staff ใช้ Supabase Auth และ RLS เพื่ออ่านข้อมูลและรับ Realtime; ทุกการเขียนผ่าน API ที่ตรวจสิทธิ์แล้ว CORS จำกัด origin ที่ใช้จริงแต่ไม่ใช้ CORS แทน authentication

แยก public-api สำหรับเมนู/QR bootstrap, customer-api สำหรับ opaque token และ staff-api สำหรับ Supabase Auth JWT ฟังก์ชัน customer ที่ไม่ใช้ Supabase JWT ต้องตรวจ token/session เองทุกคำขอ ส่วน staff ต้อง verify JWT กับ Auth และตรวจ active/role ห้ามเปิด endpoint เขียนข้อมูลโดยเพียงปิด platform JWT verification

เลือก Postgres Changes เฉพาะตาราง orders สำหรับอุปกรณ์พนักงาน แล้วอ่าน items หลัง event เพื่อลดจำนวน messages เมื่อขยายหลายร้านสามารถเปลี่ยนเป็น private Broadcast ได้ การ subscribe ต้องมี publication และสิทธิ์ SELECT ที่ RLS อนุญาต ตาม [Realtime documentation](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes)

## 1. Database Schema

DDL อยู่ที่ `supabase/migrations/202610050001_initial_schema.sql` และข้อมูลตั้งต้นที่ `supabase/seed.sql`

| กลุ่ม | ตารางและคอลัมน์สำคัญ | ความสัมพันธ์ / หน้าที่ |
|---|---|---|
| บัญชี | `admins(auth_user_id, account_slot, display_name, role, is_active)` | FK ไป `auth.users`; slot 1–4 แบบ UNIQUE จำกัดรวม 4 บัญชี |
| โต๊ะ | `restaurant_tables(id, table_number, label, is_active)` | เลขโต๊ะ UNIQUE และ CHECK 1–8 |
| QR | `qr_entrypoints(kind, table_id, token_hash)` | จุดเข้าตามโต๊ะหรือ Takeaway เก็บ hash ของ token |
| รอบใช้งานโต๊ะ | `table_sessions(id, table_id, opened_at, closed_at)` | หนึ่งรอบต่อกลุ่มลูกค้า มีได้หนึ่งรอบเปิดต่อโต๊ะ |
| ลูกค้า | `customer_sessions(entrypoint_id, table_session_id, token_hash, expires_at, revoked_at)` | session แยกจาก QR ที่พิมพ์อยู่และจากบัญชีพนักงาน |
| หมวด/เมนู | `menu_categories`, `menu_items(code, name, aliases, image_path, is_active, is_sold_out)` | category 1:N items; image_path เป็น NULL ในรุ่นทดลอง ทุกเมนูแสดง 🍜; เก็บคอลัมน์ไว้ใส่รูปภายหลัง |
| ขนาด/ราคา | `menu_variants(menu_item_id, code, name, price_satang, is_default)` | item 1:N variants เช่น ธรรมดา/พิเศษ เมนูเครื่องดื่มอาจมี variant เดียว |
| ตัวเลือก | `option_groups`, `menu_options(group_id, code, price_delta_satang)` | เส้น, ซุป, น้ำ/แห้ง, ท็อปปิ้ง |
| ตัวเลือกต่อเมนู | `menu_item_option_groups(min_selections, max_selections)`, `menu_item_options(price_override_satang, default_quantity, max_quantity)` | กำหนดว่าเมนูใดใช้ตัวเลือกใดได้ ไม่ผูกทุกตัวเลือกกับทุกเมนู |
| ออเดอร์ | `orders(channel, source, input_method, table_session_id, queue_number, fulfillment_status, payment_status, gross_satang, discount_satang, total_satang, paid_at)` | เชื่อมโต๊ะ/session; Takeaway มีคิวรายวัน; delivery มี external_order_id |
| รายการอาหาร | `order_items(menu_item_id, variant_id, quantity, base_unit_satang, options_unit_satang, snapshots)` | orders 1:N items เก็บชื่อและราคา ณ วันขาย |
| ตัวเลือกที่ขาย | `order_item_options(option_id, quantity, unit_price_satang, snapshots)` | items 1:N options; quantity ต่อชาม |
| ชำระ/คืนเงิน | `payment_transactions(kind, amount_satang, status, original_capture_id, posted_at)`, `refund_items` | รองรับจ่ายแยกและคืนเงินบางส่วน บันทึกเป็น ledger |
| ประวัติสถานะ | `order_status_events(previous_status, next_status, actor_id, actor_name_snapshot, reason)` | ตรวจย้อนหลังได้ว่าใครเปลี่ยนสถานะ |
| คิว | `daily_queue_counters(business_date, last_value)` | UPSERT แบบ atomic; ฟังก์ชัน `next_takeaway_queue()` |
| นำเข้า delivery | `delivery_import_batches(channel, input_mode, content_hash, status)` | กันการนำเข้าไฟล์เดิมและติดตาม batch |
| แหล่งรายงาน delivery | `delivery_day_coverage(channel, sales_date, reporting_mode, is_complete)` | เลือก order_detail หรือ daily_summary ต่อช่องทาง/วัน |
| ยอด delivery รายวัน | `delivery_daily_sales(gross_satang, discount_satang, refund_satang, paid_order_count, platform_fee_satang, payout_satang)` | ยอดที่บันทึกมือหรือ CSV สรุปวันที่ไม่มีรายการละเอียด |
| Sales Reports | Views `sales_events`, `sales_daily`, `menu_quantity_events` | อ่านจากข้อมูลจริง ไม่ทำตารางยอดสรุปที่ต้องเขียนซ้ำทุกครั้ง |

เงินทั้งหมดเก็บเป็นจำนวนเต็มหน่วยสตางค์ เช่น 50 บาท = 5000 และมาม่า +5 บาท = 500 จึงไม่มีความคลาดเคลื่อนจาก floating point Timestamp เก็บเป็น `timestamptz`; วันและชั่วโมงของรายงานแปลงเป็น `Asia/Bangkok` โดยใช้เที่ยงคืนเป็นวันตัดยอดตั้งต้น

`menu_variants` ใช้กับธรรมดา/พิเศษ; น้ำใส/ต้มยำใช้กลุ่ม `broth` ได้เมื่อเป็นสูตรเดียวกัน หากเย็นตาโฟเป็นคนละสูตรหรือคนละฐานราคา ให้สร้าง menu_item แยก แล้วกำหนดเส้นและ topping ของเมนูนั้น ราคาและข้อจำกัดต่อเมนูแก้ได้โดยไม่แก้โค้ด

ตัวเลือกต่อกลุ่มนับผลรวม quantity ของ options: เส้น `min=1,max=1`, topping `min=0,max` ตามร้านกำหนด ถ้าเพิ่มหมู 2 ส่วนต่อชาม ต้องอนุญาตทั้ง `max_quantity=2` และ `max_selections` ของกลุ่มให้รองรับ ค่า price_override เป็น NULL หมายถึงใช้ราคากลางของ option

### สถานะและการเปิดโต๊ะ

- ครัว: `new → preparing → ready → served`; ออเดอร์ก่อนส่งมอบสามารถ `cancelled` ได้ตามสิทธิ์
- การเงิน: `unpaid → partially_paid → paid → partially_refunded / refunded`
- ปุ่ม “ชำระเงินแล้ว” บันทึก capture และอัปเดต payment_status; ไม่เปลี่ยนสถานะครัว
- Takeaway ใช้ `ready` = รอรับ และ `served` = ส่งมอบแล้ว
- ลูกค้าสั่งเพิ่มสร้าง order ใหม่ใน table_session เดิม แคชเชียร์รวมรายการในรอบนั้นเพื่อคิดเงิน
- ปิดโต๊ะเมื่อออเดอร์ทุกรายการส่งมอบหรือยกเลิก และเคลียร์การเงินแล้ว จากนั้นปิด table_session และ revoke customer_sessions ใน transaction เดียว ลูกค้ากลุ่มถัดไปใช้รอบใหม่
- การสแกนครั้งแรกสามารถเปิดรอบโต๊ะแบบ atomic ถ้ายังไม่มีรอบเปิดอยู่ หรือ Owner เปิดรอบจาก POS ได้ การ join session ต้องตรวจ entrypoint/โต๊ะ/รอบที่ยังเปิดอยู่จากฐานข้อมูล

Takeaway แสดง `T-01`, `T-02`, … โดย format integer อย่างน้อยสองหลักและแสดงวันควบคู่ คิวหลัง 99 ต้องเป็น `T-100` ไม่ตัดเหลือสองหลัก ตัวเลขรีเซ็ตแต่ละวันด้วย counter แยกตามวันที่ ห้ามใช้ `COUNT(*) + 1`

### กฎ transaction ที่ต้องทำในขั้น implementation

DDL ให้ PK/FK/UNIQUE/CHECK, RLS, queue function และ reporting views แล้ว ส่วนกฎที่อ้างอิงหลายแถวต่อไปนี้ยังต้องเขียนเป็น transactional PostgreSQL RPC หรือ database transaction ผ่าน server connection ห้ามใช้ REST insert หลายครั้งแล้วถือว่าเป็น transaction เดียว

1. สร้างออเดอร์: ตรวจ session ที่ยังไม่หมดอายุและโต๊ะ/รอบให้ตรงกัน; ตรวจ menu/variant/options ที่ขายได้; lock หรืออ่าน catalog แบบ snapshot ที่สอดคล้องกัน; คำนวณราคาจาก DB; สร้าง order, items, options และ status event พร้อมออกคิวใน transaction เดียว
2. ราคาบรรทัด = `(variant_price + Σ(option_price × option_quantity)) × food_quantity`; `orders.gross` = ผลรวม line_gross; `orders.discount` = ส่วนลดบรรทัด + ส่วนลดทั้งออเดอร์; `total` = gross − discount ราคาและยอดใน request ใช้ตรวจเปรียบเทียบได้ แต่ไม่ใช้เป็นยอดที่เชื่อถือ
3. รับ `idempotency_key` เดิมเมื่อ retry; เปรียบเทียบ request_hash ด้วย ถ้า payload เดิมคืน order เดิม ถ้า key เดิมแต่ payload เปลี่ยนให้ 409 ป้องกันแตะปุ่มซ้ำ/เน็ตหลุดแล้วเกิดออเดอร์ซ้ำ
4. ชำระเงิน: lock order; successful captures รวมต้องไม่เกินยอดที่ต้องชำระ; ตั้ง paid_at ครั้งเดียวเมื่อชำระครบ ไม่ตั้งใหม่เมื่อ retry หรือคืนเงิน ออเดอร์ยอดศูนย์ต้องใช้ขั้น settle ที่มี audit โดยไม่สร้าง capture amount=0
5. การคืนเงินใน baseline นี้ทำหลังชำระครบ: lock order และ original capture; capture ต้อง succeeded และเป็น kind=capture; จำนวนคืนสะสมต้องไม่เกิน capture/ยอดขาย; refund_items ต้องไม่เกินจำนวนที่ขายและต้องอ้าง transaction kind=refund ถ้ารับเงินบางส่วนแล้วต้องยกเลิก ให้ settle/void เงินค้างผ่าน flow ที่ออกแบบเพิ่มก่อนเปิดใช้ split-payment cancellation
6. เมื่อชำระครบแล้วตรึงรายการ ราคา และ discounts; ห้ามลดรายการของออเดอร์ที่กำลังจ่ายบางส่วนโดยไม่เคลียร์การเงิน เปลี่ยนเมนูใน catalog ไม่เปลี่ยนออเดอร์เก่า การแก้การเงินใช้ refund ledger ไม่ลบยอดเดิม
7. เปลี่ยนสถานะ: ตรวจ transition ปัจจุบันและสิทธิ์ใน transaction พร้อม audit และ updated_at ห้ามเชื่อข้อความ status ที่ส่งมาโดยไม่ตรวจ
8. นำเข้า delivery: validate ทั้ง batch ก่อน apply; dedup external_order_id และ content_hash; เลือก reporting_mode และเขียนข้อมูลใน transaction เดียว การเปลี่ยนจาก summary เป็น detail ต้องตรวจยอด reconcile และ completeness ก่อนสลับ ห้ามสลับอัตโนมัติจากไฟล์ที่มีเพียงบางออเดอร์

### Authentication และสิทธิ์

ใช้ Supabase Auth เก็บรหัสผ่านและ session ส่วน `admins` เก็บเฉพาะ profile/role ไม่เก็บ plaintext password ตาราง profile อ้าง `auth.users(id)` ตาม [Supabase User Management](https://supabase.com/docs/guides/auth/managing-user-data) ปิด public signup สำหรับ staff และสร้าง 4 บัญชีแบบ invite โดยเซิร์ฟเวอร์หลังมีข้อมูลบัญชีจริง

Owner จัดการบัญชี ราคา และการแก้ข้อมูลนำเข้า; Admin จัดการ POS/ครัวและอ่านรายงานตาม requirement ทั้งสอง role ต้องผ่าน `is_active` ในฐานข้อมูล ลูกค้าใช้ Customer API เท่านั้น เปิด RLS ทุกตารางใน exposed schema และ revoke grants ของ anon/authenticated ก่อนให้สิทธิ์อ่าน staff ตาม [Supabase RLS guide](https://supabase.com/docs/guides/database/postgres/row-level-security)

`service_role` ข้าม RLS ได้ จึงต้องเก็บเฉพาะเซิร์ฟเวอร์และตรวจสิทธิ์ในทุก route โดยเฉพาะ body ที่อ้าง order_id, table_id, role หรือยอดเงิน ฟังก์ชันและ views ใช้ grants จำกัดไว้ใน migration; views เป็น security_invoker QR/session hashes และ import hashes ไม่ grant SELECT ให้ frontend

### Sales Reports และความหมาย KPI

Queries ตัวอย่างอยู่ที่ `supabase/queries/sales_reports.sql` ไม่มีการสมมติยอดขายจริง

| สิ่งที่แสดง | นิยามตั้งต้น |
|---|---|
| ยอดขายวันนี้ | ออเดอร์ชำระครบ ณ paid_at วันนี้ − ส่วนลด − คืนเงินที่สำเร็จวันนี้; ไม่ใช่เงินสุทธิที่ delivery โอนเข้าบัญชี |
| จำนวนออเดอร์ในรายงาน | ออเดอร์ชำระครบ นับหนึ่งครั้งต่อ order แม้จ่ายแยก; POS แสดงจำนวนออเดอร์เข้า/กำลังทำอีกชุดหนึ่ง |
| ยอดเฉลี่ยต่อออเดอร์ | (gross − discount) / paid_order_count ก่อนหักคืนเงิน เพื่อไม่ให้ refund จากวันเก่าทำให้ค่าเฉลี่ยออเดอร์วันนี้เพี้ยน |
| กราฟรายชั่วโมง | ยอดขายละเอียดตาม paid_at; คืนเงินตาม posted_at แสดงแยก; สรุปรายวันไม่มีชั่วโมงและแสดงเป็น “ไม่ทราบช่วงเวลา” |
| Peak Hours สำหรับเตรียมครัว | วัดการเข้าออเดอร์ตาม created_at แยกจากชั่วโมงรับชำระ เพื่อไม่ตีความการจ่ายรวมตอนปิดโต๊ะเป็นเวลาที่ลูกค้าสั่ง |
| Donut ช่องทาง | ใช้ยอดขายหลังส่วนลดก่อนคืนเงินที่ไม่ติดลบ; แสดงคืนเงินและยอดสุทธิแยก กรณียอดรวมเป็นศูนย์แสดง empty state |
| เมนูขายดี | จำนวนหน่วยจาก paid orders ที่มี items; refund_items ใช้แสดงจำนวนคืน/ยอดจำนวนสุทธิแยก สรุป delivery รายวันไม่ถูกนำไปเดาเมนู |
| สัดส่วนข้อมูลละเอียด | ระบุ coverage ของยอดที่มีชั่วโมง/รายการอาหาร และเตือนสถานะ incomplete จาก delivery_day_coverage; แสดง “ข้อมูลยังไม่ครบ” แทนศูนย์ |

ยอด summary และ detail ของ GrabFood/LINE MAN อยู่ร่วมกันใน storage ได้ แต่ sales_events เลือกเพียงแหล่งเดียวต่อ channel/date ออเดอร์ที่เคยชำระแล้วถูกยกเลิกยังคง sale เดิมในรายงานและมี refund หักภายหลัง ไม่กรอง sale เดิมทิ้งเพราะจะหักคืนเงินซ้ำ

หาก daily summary ไม่ทราบจำนวนออเดอร์ ให้เก็บ NULL และแสดง KPI จำนวนรวม/ค่าเฉลี่ยว่า “ข้อมูลไม่ครบ” ห้ามแทนด้วย 0 การรวม KPI ข้ามช่องทางต้องรักษา NULL นี้ ไม่ใช้ COALESCE เพื่อกลบข้อมูลที่หายไป ค่า commission/payout เป็นข้อมูลกระทบยอดแยกจากยอดขาย และไม่ใช้คำนวณเมนูขายดี

รุ่นทดลอง Export CSV จาก facts ที่ใช้ใน Dashboard ด้วยช่วงเวลา/ช่องทางเดียวกัน เปิดใน Excel ได้ ส่วน XLSX เพิ่มภายหลังได้โดยไม่ต้องมี paid service แสดงหน่วยเงินบาท วันเวลา และ coverage ให้ชัดเจน แปลงสตางค์เป็นบาทตอนแสดง/ส่งออก รองรับ UTF-8 สำหรับภาษาไทย และ escape ข้อความที่ spreadsheet อาจอ่านเป็นสูตร

## 2. Voice Order System Prompt

Voice เป็น feature เสริมที่ปิดและไม่ deploy ใน MVP ไม่ติดตั้ง Gemini SDK หรือใส่ API key จนกว่าจะเลือกเปิดใช้ เก็บ Prompt ที่ `supabase/functions/_shared/voice/system-prompt.th.txt` และ JSON Schema สำหรับ server validation ที่ `supabase/functions/_shared/voice/response.schema.json` ส่วน `gemini-response.schema.json` เป็น subset สำหรับส่งให้โมเดล ตัวอย่างอยู่ใน `docs/voice-examples.json` เป็น expected outputs สำหรับออกแบบ ไม่ใช่ผลการเรียก Gemini จริง

Flow เมื่อเปิดใช้ภายหลัง: SpeechRecognition `lang="th-TH"` → final transcript → voice Edge Function → Gemini + catalog ที่เซิร์ฟเวอร์สร้าง → ตรวจ JSON และ business rules → เพิ่มรายการลงตะกร้าเมื่อ `status=ready` → ลูกค้าตรวจรายการ → กดส่งออเดอร์

ตั้ง structured JSON response ด้วย gemini-response.schema.json แทนการขอ JSON ผ่าน prompt เพียงอย่างเดียว Gemini รองรับ JSON Schema บางส่วน จึงเอา string length และ schema metadata ออกจากไฟล์สำหรับโมเดล แล้วตรวจข้อจำกัดครบด้วย response.schema.json ฝั่งเซิร์ฟเวอร์ โครงสร้างที่ถูก schema ยังอาจตีความเมนูผิด จึงต้องตรวจ catalog/constraints อีกครั้ง ตาม [Gemini Structured Outputs](https://ai.google.dev/gemini-api/docs/structured-output)

Server validation เพิ่มจาก schema: status ต้องสัมพันธ์กับ items/unresolved; ตรวจรหัส menu/variant/group/option และ min/max; ตรวจ availability ใหม่; ตรวจ notes allowlist; ห้าม options ซ้ำ; จำกัด transcript 1000 ตัวอักษร และรวมจำนวนรายการเหมือนกันแล้วไม่เกิน 20 ต่อบรรทัด คำนวณราคาและเปรียบเทียบ catalog version ก่อนส่ง ถ้าราคาเปลี่ยนให้ลูกค้าตรวจยอดใหม่

เมื่อ needs_clarification ให้พักคำขอเสียงทั้งชุดและถามรายละเอียด ไม่เพิ่มบางส่วนเงียบ ๆ รอบถัดไปส่ง transcript เดิมและคำตอบที่รวมแล้วเป็นข้อความใหม่ โดยไม่อนุญาตคำตอบให้เปลี่ยนรายการที่เพิ่มไปก่อนหน้า ใช้ request ID แยกสำหรับการ parse และการเพิ่มตะกร้าเพื่อกันผลเสียง final ซ้ำ

Web Speech API ไม่รองรับทุก browser และบาง implementation ส่งเสียงไปประมวลผลผ่านบริการภายนอกจึงใช้ offline ไม่ได้ ตาม [MDN SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition) ต้อง feature-detect รวม webkitSpeechRecognition และมีการพิมพ์/แตะเลือกเมนูเป็น fallback ไม่ถือว่า PWA รับประกันการสั่งด้วยเสียงทุกอุปกรณ์หรือ offline

ไม่เก็บเสียงดิบเป็นค่าเริ่มต้น; แสดงข้อความที่ได้ให้ลูกค้าแก้ไขได้ หากต้องเพิ่ม audio upload/STT fallback ให้ทำเป็น integration แยกในขั้นต่อไป เก็บ GEMINI_API_KEY เฉพาะ server ใช้ timeout/rate limit ต่อ session และไม่ให้ AI เขียน DB โดยตรง

## 3. โครงสร้างโปรเจกต์

ผังเต็มและหน้าที่แต่ละส่วนอยู่ที่ `docs/project-structure.md` โครงสร้างใช้ frontend static หนึ่งแอป แยก domain logic ฝั่งเซิร์ฟเวอร์ที่ `supabase/functions/_shared` และ transactional RPC ใน migrations แบ่ง UI ตาม Customer, Kitchen, POS, Dashboard

## ขอบเขต PWA และ Real-time

- Cache app shell และ public catalog ที่มี version; ใช้ 🍜 แทนภาพอาหารและเก็บ draft cart ในเครื่อง รูปบน Pages เพิ่มภายหลังเมื่อผ่านการทดลองแล้ว
- Auth/session/payment/order API ใช้ network และ no-store ไม่ cache ผลข้อมูลส่วนตัว
- Offline แสดงสถานะชัดเจนและห้ามบอกว่า “สั่งสำเร็จ” ก่อน server ACK; retry คำขอเดิมด้วย idempotency key เดิม
- Kitchen อ่าน order และ items โดยตรงผ่าน Supabase SELECT + staff RLS หลัง event/reconnect ไม่ผ่าน Edge Function ทุกครั้ง Realtime เป็น notification layer ไม่ใช่แหล่งข้อมูลหลัก
- ลูกค้า poll สถานะเฉพาะแท็บที่กำลังเปิดดูออเดอร์ทุก 30 วินาที และหยุดเมื่อส่งมอบ/ยกเลิกหรือซ่อนแท็บ ไม่ poll ทั้งร้าน ครัว/POS ยังคงใช้ Real-time
- ปุ่มเปิดเสียงแจ้งเตือนต้องเริ่มจาก user gesture เพื่อให้ browser เล่นเสียงได้ และกันเตือนซ้ำด้วย order ID ไม่เตือน snapshot เดิมทุกครั้งที่ reconnect
- POS Walk-in ใช้ order service เดียวกับ QR แต่ route ตรวจ staff identity; เลือกโต๊ะหรือ Takeaway และออกคิวจากฐานข้อมูล
- API delivery เป็น adapter รอสิทธิ์/contract จากผู้ให้บริการ เริ่มด้วย manual/CSV ที่ใช้งานได้โดยไม่พึ่งสิทธิ์ API

## สถานะการตรวจสอบ

ตรวจ JSON syntax และโครงสร้างตัวอย่างกับชนิดข้อมูล required fields, enum, bounds และ status invariants ใน workspace นี้ ยังไม่ได้ apply migration บน Supabase/PostgreSQL เรียก Gemini หรือทำ load test จริง เพราะยังไม่มี deployment และ credentials ของโปรเจกต์ ก่อนทดลองในร้านต้องทดสอบ migration/seed, transactional RPC, RLS allow/deny, สร้างออเดอร์พร้อมกัน, retry, ชำระ/คืนเงิน, นำเข้า delivery ซ้ำ และเกณฑ์ใน free-tier-pilot.md

ข้อมูลจากภาพใช้ยืนยันหมวดเมนู ธรรมดา/พิเศษ เส้น 6 แบบ และมาม่า +5 บาทเท่านั้น seed ยังไม่เปิดขายรายการอาหารจริง เพื่อให้ตรวจชื่อ ราคา และตัวเลือกที่แต่ละเมนูอนุญาตก่อนนำเข้า ไม่ได้สร้าง 4 บัญชีจริงหรือพิมพ์ QR ก่อนมีชื่อบัญชีและ production domain
