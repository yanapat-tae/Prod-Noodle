# โครงสร้างที่เขียนแล้ว

```text
prod-noodle-pos/
├── src/
│   ├── App.tsx, main.tsx              # แยก Staff เป็น lazy chunk
│   ├── api.ts                        # Demo/Supabase adapter + Realtime
│   ├── domain.ts                     # Types, pricing, validation, demo reports
│   ├── catalog.ts                    # เมนูเริ่มต้น 14 รายการ
│   ├── pages/
│   │   ├── Customer.tsx              # QR session + status
│   │   ├── Ordering.tsx              # เมนู/ตัวเลือก/ตะกร้า ใช้ซ้ำใน POS
│   │   ├── Staff.tsx                 # Login/POS/Kitchen/Delivery/Menu/QR/Accounts
│   │   └── Dashboard.tsx             # Recharts + CSV
│   └── styles/                       # UI + accessibility tokens
├── server/demo.mjs                   # API/ข้อมูลกลางบนเครื่อง
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   │   ├── 202610050001_initial_schema.sql
│   │   └── 202610050002_application_api.sql
│   ├── seed.sql, menu-seed.sql
│   ├── queries/sales_reports.sql
│   └── functions/
│       ├── public-api/index.ts       # Catalog/QR session
│       ├── customer-api/index.ts     # Own orders/create
│       ├── staff-api/index.ts        # JWT/role + guarded mutations
│       ├── deno.json
│       └── _shared/
│           ├── http.ts               # Auth, CORS, RPC error handling
│           └── voice/                # Prompt/schemas เผื่อภายหลัง ไม่ deploy
├── public/                           # PWA, icons, Pages headers, CSV template
├── scripts/                          # Dev, seed/icons generators, pilot load
├── tests/                            # Domain, HTTP, PGlite, local Deno type shim
├── docs/                             # Cloud setup, verification, architecture
└── package.json, pnpm-lock.yaml, .env.example
```

Database mutation ทุกเส้นทางผ่าน RPC ที่คำนวณราคาจาก DB และทำ transaction เดียว ลูกค้าไม่อ่านตารางตรง Staff อ่านด้วย RLS; orders/table_sessions เท่านั้นที่ subscribe Realtime ทุกเมนูใช้ 🍜; ไม่มี Voice endpoint, menu photos หรือ remote font

การรัน/deploy/ขอบเขตดู README.md และ cloud-setup.md ส่วน architecture-baseline.md เป็นแผนแรกที่มีฟีเจอร์เผื่อเฟสถัดไป
