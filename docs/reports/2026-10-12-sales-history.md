# แก้ช่องทางชำระเงินและลบยอดทดลอง · 12 ต.ค. 2026

คำขอเจ้าของร้าน: ตัวเลขชำระเงินซ้อนบน iPhone, ต้องล้างยอดที่กดทดลองทั้งหมด
เพื่อเริ่มทดลองที่ร้าน 13 ต.ค. 2026 และให้เฉพาะผู้ดูแลลบรายการที่ไม่ได้เกิดจริง
คำขอนี้อนุญาต cleanup ใหม่ของข้อมูลทดลองที่ตรวจปัจจุบัน ไม่ใช่ให้ทำ cleanup
ที่เคยกล่าวถึง 10 ต.ค. ซ้ำ

## การแก้ไข

ช่องทางขายใช้ grid 3 คอลัมน์ (จุดสี / ชื่อ / ยอด) แต่ช่องทางชำระเงินมี 2 ช่อง
และใช้ class เดียวกัน ชื่อจึงถูกบีบเหลือ 10px เพิ่มรูปแบบช่องทางชำระเงินที่
เว้นช่องชื่อกับยอด และขึ้นบรรทัดใหม่เมื่อจอแคบหรือขยายข้อความ

ผู้ดูแล (role `owner`: เต้ / ปลั๊ก / พี่ปราง) เปิด **ยอดขาย → จัดการประวัติยอดขาย**
เลือกทีละรายการหรือทั้งหมด ระบุเหตุผล ตรวจจำนวน และยืนยันอีกครั้ง บัญชีพนักงาน
(role `admin`: พ่อ / ฟ้า / แม่) ไม่มีสิทธิ์ทั้ง UI, Edge API และ SQL RPC
ดู [คู่มือ](../sales-history.md)

บันทึก `sales_deleted_at` เพื่อไม่นับยอด/คืนเงิน/ช่องทางชำระ/ชั่วโมง/อันดับ/CSV
และซ่อน POS/ครัว/ใบรายการลูกค้า บิล ราคา snapshot ledger และ receipt ยังอยู่
ไม่มี capture/refund ใหม่ `sales_deletions` เก็บผู้ทำ เวลา เหตุผลและรายการคำขอ
ตรวจเวอร์ชันทุกแถวก่อนลบใน transaction ใช้ lock 814208 ร่วมกับ order/payment
กันข้อมูลเปลี่ยนระหว่างตรวจ, ไม่แตะรายการใหม่ที่ไม่ได้เลือก, retry ใช้ key/payloadเดิม
ปิดเฉพาะ visit ที่ไม่มีรายการจริงเหลืออยู่

Receipt replay ถูกปฏิเสธเมื่อมี deleted order ใดใน expectedOrderIds รวมถึงรอบที่
ไม่ใช่ anchor ออเดอร์ทดลองที่ลบแล้ว retry ด้วย key เก่าจะไม่เปิดบิลใหม่ Delivery
import ใหม่แทน summaryที่ลบได้ แต่ replay batchเดิมไม่ทำให้กลับมานับยอด
Demo/HTMLใช้พฤติกรรมเดียวกัน และ revisionใหม่ทุก import กัน identical-content ABA

## หลักฐาน

- `pnpm check`: 81/81 ผ่าน, frontend/edge typechecks, lint, build และ preview.html
- Chromiumครบ 47/47; ตรวจรอบสุดท้ายเฉพาะ Dashboard/POS 15/15 และ mobile screenshot 2/2
- Mobile 320/390/430px และข้อความ 100%/200%; visual inspectionผ่าน
- Regressionรูปแบบเดิมล้มเหลวจริงเพราะชื่อ overflow; paid-bill non-anchor replay
  ล้มเหลวจริงก่อนแก้ จากนั้น regressionผ่าน
- Reviewerตรวจสองรอบ ไม่พบ important blockerหลังแก้ receipt replay และ error wording
- Hosted migrationใหม่ `20261012145337_sales_history_cleanup.sql` → version
  `20261012150840`, name `sales_history_cleanup`; ไม่ replay migration/seedเก่า
- `staff-api` v7 ACTIVE, explicit Auth/profile guards, `verify_jwt=false`ตามระบบเดิม
- Hosted rollback functional checkผ่าน: Staff403, soft exclusion28รายการ,
  รายงานเดือน/ช่องทางชำระเป็น0, ledgerเดิม หลังrollbackมี28 active ordersและaudit0
- ก่อน cleanupมี28 paid orders รวม328,200สตางค์, ไม่มี Delivery summary/โต๊ะเปิด
  fingerprintบิลเดิมตรงหลังmigration; ledger/QR/profile/item/optionsตรงก่อนcleanup

Physical iPhone/Safari และ loginด้วยรหัสจริงยังไม่ได้ทดสอบ ChromiumและSQL
ไม่ใช่หลักฐานว่าโทรศัพท์จริงผ่าน การใช้งานวันแรกยังควรตรวจบนเครื่องของร้าน

## การเผยแพร่และ cleanup

เผยแพร่แล้วผ่าน [PR #8](https://github.com/yanapat-tae/Prod-Noodle/pull/8),
merge `a279ae09bcad3319a4e6b4b92a5d7b10f85dde14`. Cloudflare production
`71faa211-cba7-46f2-b427-33088febbfb8` SUCCESS เวลา22:16:22 Bangkok
หน้า `/` และ `/admin`200, servedJS/CSSตรงproduction-configured buildทุกไฟล์
(`index-Bw0sCO9y.js`, `Staff-BtFEAWCg.js`, `index-Bai-mxew.css`).
Public catalog41; history/delete401เมื่อไม่ล็อกอิน, allowedCORS204, untrustedOrigin403

ทำ fixed-snapshot cleanupครบ28รายการเวลา22:19:03 Bangkokแล้ว โดยใช้
`supabase/operations/20261012_requested_test_sales_cleanup.sql` แยกจาก migration:
ยืนยัน hash/28รายการก่อนทำ จำกัด created_atถึง `2026-10-11T07:54:57.113539Z`
จึงไม่แตะออเดอร์ใหม่ และจะหยุดหาก snapshotเปลี่ยน ห้ามรันoperationซ้ำ

หลังcleanup: activeorders0, sales_events0, audit1; รายงานเดือนตุลาคม gross/net/refund/count
และทุกpaymentmethodเป็น0, topว่าง ตรวจhashledger, billreceipts, item/optionsnapshots,
QR, staff, menu, visitsตรงก่อนcleanupทุกชุด ไม่มีรับเงินหรือคืนเงินใหม่
ดู [ผลลัพธ์](sales-2026-10-12/outcome.json), [preservation](sales-2026-10-12/preservation.json)
และ [productionassets](sales-2026-10-12/production-assets.json)

## ย้อนกลับ

หากfrontendต้องย้อน ให้revert release commitตามปกติ เก็บmigrationแบบ additiveไว้
ค่าปกติของ flagเป็นNULL ไม่ต้องลบคอลัมน์หรือaudit หากต้องกู้รายการทดลอง ให้ผู้ดูแล
ระบบตรวจ audit และคืนเฉพาะ flags/updated_atจาก snapshotที่เลือก รักษาledgerเดิม
ห้ามทำ refundชดเชยเพราะเป็นข้อมูลทดลอง ไม่มีเงินจริงถูกคืน
