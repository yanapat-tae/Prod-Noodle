# การใช้โควตา Supabase และ Cloudflare

เจ้าของร้านเข้า `/admin` แล้วเลือก **การใช้โควตา** หน้าเดียวแสดงทั้งสองบริการ พร้อมเปอร์เซ็นต์ จำนวนที่ใช้/เพดาน ที่เหลือ แหล่งข้อมูล และเวลาที่วัด แถบเตือนที่ 80% และ 95%; เมื่อเกินเพดาน ตัวเลขจริงยังแสดงเกิน 100% ได้ การไม่มีข้อมูลไม่ถูกแสดงเป็น 0% พนักงานทั่วไปไม่มีสิทธิ์หน้านี้ แต่ยังดู QR ตาม release เดิมได้

## แหล่งข้อมูล

- **Supabase ฐานข้อมูล:** RPC ที่ตรวจ Owner วัดผลรวม `pg_database_size` ตามเอกสาร Supabase พร้อมข้อมูลและดัชนี ใช้เพดาน 500 MB ฐานสิบ
- **Supabase รูป/ไฟล์:** รวมขนาดจาก metadata ของ `storage.objects`; หากขนาดไม่ครบแสดง unavailable แทนผลรวมบางส่วน เพดาน 1 GB ฐานสิบ
- **Supabase API/Egress/Realtime:** รายงานคิดโควตาเป็นระดับองค์กรและรอบบิล ไม่อนุมานจากออเดอร์/logs public Management API ที่ตรวจไม่เปิด org Usage endpoint; endpoint ของ Studio ไม่รับ PAT ที่มีอยู่ ให้เปิดรายงาน Supabase เพื่อดูค่าจริง ไม่คัดลอก cookie/PAT เข้ามาในเว็บ
- **Cloudflare Builds:** snapshot จาก Pages API ครบทุกโครงการและทุกหน้าประวัติ นับ Build ที่เริ่มในเดือนปฏิทิน UTC รวม Preview และ Build ที่ไม่ผ่าน ข้อมูลนี้นับประวัติที่ยังมีอยู่ ไม่สามารถรวมรายการที่ถูกลบ และไม่อ้างว่าเป็น billing ledger
- **Cloudflare โครงการ:** จำนวน Pages projects ทั้งบัญชีจาก Pages API
- **Cloudflare Static requests:** ฟรีไม่จำกัดจำนวนครั้ง จึงไม่มีเปอร์เซ็นต์ ส่วน Pages Functions ของเว็บร้านระบุว่าไม่ได้ใช้เมื่อ API ยืนยันการตั้งค่า

พื้นที่ DB/Storage ไม่รีเซ็ตทุกเดือน. Snapshot Cloudflare เก็บเวลาจริงและเตือนเมื่อเกิน 24 ชั่วโมง; เมื่อเปลี่ยนเดือน Builds เดิมจะ unavailable จนเก็บรอบใหม่ ปุ่ม **โหลดข้อมูลล่าสุด** วัด DB/Storage ใหม่และอ่าน snapshot ล่าสุดที่เก็บอยู่ ไม่อ้างว่าอัปเดต Cloudflare โดยตรง

## อัปเดต snapshot

รันใน environment ที่เชื่อมต่อ credential ของเจ้าของแล้วเท่านั้น:

```sh
NODE_USE_ENV_PROXY=1 node scripts/sync-service-usage.mjs --read-only
NODE_USE_ENV_PROXY=1 node scripts/sync-service-usage.mjs
```

โหมด read-only ตรวจ Cloudflare โดยไม่เขียนอะไร โหมดปกติ upsert เฉพาะ `service_usage_snapshots` ผ่าน Supabase Management API ไม่แก้ยอดขาย เมนู พนักงาน หรือ QR. Collector ใช้ `SUPABASE_ACCESS_TOKEN` และ `CLOUDFLARE_API_TOKEN` ใน environment; ไม่ส่ง token กลับเบราว์เซอร์หรือคัดลอกเป็น hosted secrets. ค่าเริ่มต้นคือโครงการร้านที่ตรวจแล้ว; เปลี่ยนได้ด้วย `SUPABASE_PROJECT_REF` และ `CLOUDFLARE_ACCOUNT_ID`.

รุ่นนี้เก็บ snapshot ระหว่าง release/maintenance; ยังไม่มี scheduler อัตโนมัติ ไม่เพิ่มค่าใช้จ่ายหรือสร้างบัญชีบริการเพิ่ม. HTML และ Node demo แสดงข้อมูลตัวอย่างที่ติดป้ายชัดเจน.
