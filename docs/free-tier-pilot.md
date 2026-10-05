# รุ่นทดลอง: ใช้บริการฟรีก่อน แล้ววัดช่วงเที่ยง

เป้าหมายคือทดลอง QR → เลือกเมนู → ส่งออเดอร์ → ครัว → คิดเงิน สำหรับร้าน 8 โต๊ะและ Takeaway โดยตั้งค่า service ไว้ที่ Free และปิด Voice/Gemini ก่อน ตัวเลขโควตาด้านล่างตรวจจากเอกสารผู้ให้บริการวันที่ 5 ตุลาคม 2026 เป็นโควตาที่ประกาศ ไม่ใช่ผล benchmark ของแอปนี้ ยังไม่มี deployment หรือผล load test จริง

## บริการที่เลือก

| ส่วน | บริการ / วิธีทำ | ค่า service ตั้งต้น | ข้อจำกัดที่ต้องวัด |
|---|---|---:|---|
| Customer PWA + POS + Kitchen + Dashboard | React/Vite static SPA บน Cloudflare Pages Free | 0 | โหลด JS บนมือถือและเครือข่ายร้าน; ไม่มีรูปอาหาร |
| ภาพแทนเมนู / icons / เสียงเตือน | ทุกเมนูใช้ 🍜; icons/เสียงเตือนเป็น static assets | 0 | ไม่โหลดรูปอาหารและไม่เรียก image service |
| Database + staff Auth | Supabase Free 1 project | 0 | DB 500 MB, shared CPU/RAM; query และ transaction ช่วง burst |
| API เขียนออเดอร์/ชำระ/เปลี่ยนสถานะ | Supabase Edge Functions → PostgreSQL RPC | 0 ภายในโควตา | 500,000 invocations/เดือน; cold start และ RPC latency |
| Real-time ครัว/POS | Supabase Realtime เฉพาะ staff, orders และ table_sessions | 0 ภายในโควตา | 200 concurrent connections, 2 ล้าน messages/เดือน, 100 messages/วินาที |
| รายงาน / CSV export | PostgreSQL views + โค้ด frontend | 0 | query ช่วงเวลามี index; ไม่ refresh กราฟทั้งร้านทุกวินาที |
| Delivery | บันทึกยอดรายวัน / CSV | 0 | เวลาในการกรอกและ reconcile ไม่ต้องใช้ vendor API |
| Voice / Gemini | ปิด feature และไม่ deploy endpoint | 0 | พิจารณาใหม่เมื่อ UI ใช้งานจริงแล้วพบว่าช่วยลดเวลาสั่ง |
| Domain | ใช้ URL ที่ Cloudflare ให้ เช่น pages.dev | 0 | จ่ายค่าซื้อโดเมนเมื่อมีเหตุผลด้านแบรนด์ภายหลัง |

Cloudflare ระบุว่า static asset requests ฟรีและไม่จำกัด ส่วน Functions มีโควตาแยก รุ่นนี้ใช้ Pages สำหรับ static เท่านั้น จึงไม่ใช้ Pages Functions สำหรับ API ตาม [Pages Pricing](https://developers.cloudflare.com/pages/functions/pricing/) Free มี 500 builds/เดือนตาม [Pages Limits](https://developers.cloudflare.com/pages/platform/limits/) build ไม่เท่ากับการเปิดหน้าเว็บของลูกค้า

Supabase Free มี DB 500 MB, shared CPU, RAM 500 MB, egress 5 GB และ cached egress 5 GB, storage 1 GB และหยุด project หลังไม่ใช้งานหนึ่งสัปดาห์ตาม [Supabase Pricing](https://supabase.com/pricing) รุ่นทดลองใช้ 🍜 และยังไม่มีรูปอาหาร หากเพิ่มรูปภายหลังจะเสิร์ฟจาก Pages เพื่อลดปริมาณข้อมูลที่ออกจาก Supabase โควตา Edge Functions ตรวจจาก [Functions Pricing](https://supabase.com/docs/guides/functions/pricing) และ Realtime จาก [Realtime Limits](https://supabase.com/docs/guides/realtime/limits) / [Billing Quotas](https://supabase.com/docs/guides/platform/billing-on-supabase)

ไม่เลือก Vercel Hobby เป็นโฮสต์ร้าน เพราะกำหนดไว้สำหรับ personal/non-commercial ตาม [Vercel Terms](https://vercel.com/legal/terms) ไม่จำเป็นต้องใช้ paid Vercel เพื่อทดลองแนวทางนี้

## ขอบเขตรุ่นแรก

ทำก่อน: QR โต๊ะ 1–8 และ Takeaway, เมนูแบบแตะเลือก, ตัวเลือกเส้น/ขนาด/ท็อปปิ้ง, ตะกร้า, ยืนยันออเดอร์, Kitchen/POS real-time, 4 staff accounts, ชำระเต็มจำนวนด้วยเงินสด/บันทึก PromptPay โดยแคชเชียร์, ยอดขายรายวันพื้นฐาน และ CSV export การแบ่งจ่ายเป็นโครงสร้างเผื่อไว้ใน DB และยังไม่เปิดใน UI ทดลอง

ข้อมูล delivery ใช้ยอดรายวัน/CSV ก่อน ไม่ใช้ API partner ในรอบทดลอง ปุ่มเพิ่ม Voice, automatic payment verification, vendor integrations และ dashboard ขั้นสูงยังไม่อยู่บน critical path โครงสร้าง DB และ prompt ยังเตรียมไว้สำหรับเพิ่มภายหลัง

UI ลูกค้า: ทุกเมนูใช้ 🍜 โดยมีชื่ออาหารและราคาที่อ่านได้ชัด แสดงโต๊ะหรือ Takeaway ที่หัวหน้าจอตลอด ตัวอักษรหลักประมาณ 20px ชื่ออาหาร/ราคา 24–28px ปุ่มและตัวเลือกสูงอย่างน้อย 56px เว้นช่องว่าง 12px เมนูบนมือถือเป็นหนึ่งคอลัมน์ ใช้ข้อความเต็ม ไม่ซ่อนชื่อด้วยจุดไข่ปลา แตะเมนูแล้วเลือกขนาดและเส้นด้วยตัวเลือกแถวใหญ่ที่แตะได้ทั้งแถว ระบุ “มาม่า +5 บาท” และราคา topping ข้างตัวเลือก ปุ่มตะกร้า/ยอดรวมอยู่ด้านล่างโดยไม่บังรายการ รองรับการซูมและมีข้อความ “เลือกแล้ว” ไม่ใช้สีเพียงอย่างเดียว ดูข้อกำหนดเต็มใน customer-accessibility.md

## ออกแบบเพื่อลดภาระบริการฟรี

1. ใช้ static assets และ app shell cache ทุกเมนูใช้ emoji 🍜 ไม่โหลดภาพอาหารหรือ font จากบริการภายนอกในรุ่นทดลอง ถ้าเพิ่มรูปภายหลังค่อยใช้ WebP ย่อขนาดและชื่อไฟล์/version ใหม่บน Pages
2. QR bootstrap สร้าง customer session ที่มีอายุ ส่ง opaque token ผ่าน Authorization header; เมนูแสดงจาก catalog ที่มี version และ server/RPC ตรวจราคาจริงเมื่อ submit
3. มี WebSocket เฉพาะอุปกรณ์ staff โดยใช้ connection เดียวต่อแท็บ Subscribe orders และการเปิด/ปิด table_sessions แล้ว SELECT order/items ผ่าน staff RLS ไม่กระจาย event ทุก topping ให้ทุกคน
4. ลูกค้า poll ทุก 30 วินาทีเมื่อหน้าลูกค้ามองเห็นและมีออเดอร์ค้าง และหยุดเมื่อส่งมอบ/ยกเลิกหรือแท็บถูกซ่อน เส้นทางสร้างออเดอร์ไม่รอรอบ polling ครัว/POS ใช้ Real-time
5. สร้างออเดอร์และคิวใน transactional RPC เดียว ใช้ idempotency key กันการ retry เกิดรายการซ้ำ Staff อ่านได้ตรงผ่าน RLS แต่การเขียนต้องมี guard
6. ครัวโหลดเฉพาะรายการ active/ล่าสุด กราฟ query เมื่อเปิดหรือเปลี่ยน filter ไม่ subscribe ข้อมูลทุกรายการและคำนวณรายงานทุกวินาที
7. บันทึก latency/error/request ID แบบไม่เก็บเสียงหรือ transcript ใน MVP เก็บผล load test ในเครื่องเพื่อไม่กินพื้นที่ฐานข้อมูลโดยไม่จำเป็น

200 Realtime connections คือจำนวน WebSocket ไม่ใช่เพดานลูกค้าที่เปิดเมนู ทุกแท็บที่เปิดถือเป็น connection แยก โควตา messages ต้องนับ fan-out ต่อ subscriber ด้วย เช่น change หนึ่งครั้งที่ส่งให้ 4 staff tabs ไม่ควรถูกประมาณเป็น message เดียว

### ตัวอย่างคำนวณโควตา — เป็นสมมติฐานสำหรับวางแผน

สมมติ 300 ออเดอร์/วัน หนึ่ง session ต่อออเดอร์ ลูกค้าเปิด status เฉลี่ย 10 นาที เปรียบเทียบ polling 15 และ 30 วินาที:

- ถ้า poll 15 วินาที: 40 status calls + 4 calls สำหรับ bootstrap/menu/submit/อื่น ๆ + 4 staff write calls = ประมาณ 48 Edge invocations ต่อออเดอร์
- `300 × 48 × 30 = 432,000 invocations/เดือน` ก่อนการ retry, CORS preflight, import/export และงานเพิ่มเติม จึงมีพื้นที่เหลือไม่มากเมื่อเทียบกับ 500,000
- รุ่นทดลองเลือก 30 วินาที: ประมาณ `300 × (20 + 4 + 4) × 30 = 252,000` ก่อนงานเพิ่มเติม
- ประมาณการนี้ไม่ใช่จำนวนออเดอร์จริงของร้าน ต้องใช้ usage dashboard และจำนวน calls ที่วัดได้ต่อคำสั่งจริงแทน ก่อนตัดสินใจเพิ่มบริการ

โควตาต่อเดือนไม่บอกว่าจะรับ 40 คนกดพร้อมกันได้เร็วแค่ไหน เพราะความเร็วขึ้นกับ CPU, query, lock contention และเครือข่ายด้วย จึงต้องทดสอบทั้ง burst และการใช้งานต่อเนื่อง

## แผนทดสอบช่วงเที่ยง

ใช้ deployment ทดลองและข้อมูลอาหารราคาเดียวกับที่จะใช้จริง แยกข้อมูล load test ออกจากยอดขายร้าน ห้ามทดสอบด้วย mock API แล้วอ้างว่าฐานข้อมูลฟรีผ่าน เลือก region ใกล้ร้านหากมีในบัญชี และวัด latency จากเครือข่ายในประเทศไทย

| รอบ | โหลดจำลอง | สิ่งที่ต้องดู |
|---|---|---|
| Smoke | 1 ลูกค้า + POS + ครัว | QR/table scope, ราคามาม่า, คิว, เปลี่ยนสถานะ, ยอดชำระ |
| ปกติ | 10 แล้ว 30 customers + 4 staff tabs อย่างละ 10 นาที | ACK latency, menu load, calls/order, usage |
| ช่วงแน่น | 60 customers + 4 staff tabs 20 นาที | transaction errors, realtime lag, query CPU |
| เผื่อช่วงสูง | 100 customers + 4 staff tabs 10 นาที | ขอบเขตการรับโหลดและ graceful errors |
| Burst | 40 submissions ภายใน 10 วินาที ใช้หลายโต๊ะและ Takeaway | queue uniqueness, order count, message throughput |
| เครือข่าย | retry key เดิมหลายครั้ง, ตัดต่อ Wi-Fi และกลับมาเปิดแท็บ | duplicate=0, refetch หลัง reconnect, ACK recovery |

จำนวน customers ในตารางคือสถานการณ์จำลอง ไม่ใช่ประมาณการจำนวนที่นั่งหรือจำนวนลูกค้าจริง ถ้าเห็น traffic จริงมากกว่านี้ให้เพิ่มระดับหลังตรวจ headroom ของโควตา

เกณฑ์ผ่านตั้งต้น: p95 order ACK ≤2 วินาทีในช่วง steady load, initial/cold request ≤5 วินาที, p95 ครัวเห็นออเดอร์หลัง ACK ≤3 วินาที, operational API errors <1%, ทุกออเดอร์ที่ได้ success ACK ต้องอยู่ใน DB, ออเดอร์/เลขคิวซ้ำ = 0, ยอดรายการ/ชำระ/รายงานกระทบยอดตรงกัน และไม่มีคำขอค้างโดยไม่แจ้งลูกค้า ค่าพวกนี้เป็นเป้าหมายที่กำหนด ไม่ใช่ผลที่วัดแล้ว

บันทึกพร้อมผล: เวลาไทย ระดับโหลด อุปกรณ์/เครือข่าย p50/p95/p99 ของ create-order, latency จอครัว, cold starts, error codes, duplicate count, CPU/DB size/egress, Edge invocations และ Realtime messages แยกปัญหา Wi-Fi ร้านออกจาก API โดยเปรียบเทียบเครือข่ายอีกชุด

หลัง load test ผ่าน ให้ทดลองช่วงเที่ยงจริง 2–3 วันโดยมีวิธีรับออเดอร์และคิดเงินเดิมของร้านพร้อมใช้ ตั้งโต๊ะ/คิวให้ชัด เก็บเวลาที่ใช้สั่งและจำนวนลูกค้าที่ต้องให้พนักงานช่วย รวมผู้สูงอายุในการทดลองให้เขาเลือกเมนู/เส้น/จำนวนและส่งออเดอร์ด้วยตนเอง บันทึกตัวหนังสือที่อ่านไม่ชัด จุดกดพลาด และจุดที่ต้องช่วยก่อนเพิ่มรูปหรือ Voice

## เกณฑ์เลือกจ่ายเป็นรายบริการ

- ดู usage ที่ 70–80% ของโควตาเพื่อมีเวลาปรับ ไม่ถือว่าถึง 80% แล้วต้องอัปเกรดทันที
- ถ้า calls มากเพราะ polling ให้ปรับรอบ/หยุดแท็บซ่อนก่อนซื้อโควตา
- รุ่นทดลองยังไม่มีรูปอาหาร ถ้าเพิ่มรูปภายหลังและ egress มาก ให้ย้าย/ย่อรูปบน Pages ก่อนเพิ่มแพลน DB
- ถ้า query หรือ CPU เป็นคอขวดหลังเพิ่ม index/ลด payload และ latency ยังเกินเกณฑ์ ให้พิจารณาเพิ่ม Supabase โดยเก็บ frontend Free ต่อ
- ถ้า Real-time เกิน limit ให้ลด event/fan-out และตรวจจำนวนแท็บก่อนซื้อแพลน
- Voice พิจารณาเฉพาะเมื่อผลทดลองชี้ว่าลดเวลา/ลดความผิดพลาดได้ และคุม quota/cost ได้ ไม่มีการเปิด AI key โดยอัตโนมัติ

Free project อาจ pause เมื่อไม่มี activity และไม่มี automatic backup รวมในแพลนตาม [Supabase Pricing](https://supabase.com/pricing) ก่อนวันเทสต้องตรวจ project พร้อมใช้งาน และทำ manual DB backup/CSV หลังวันทดลอง ค่าบริการ 0 บาทในเอกสารนี้ไม่รวมอินเทอร์เน็ต อุปกรณ์ หรือโดเมนที่เลือกซื้อเอง และไม่ใช่การรับประกัน uptime
