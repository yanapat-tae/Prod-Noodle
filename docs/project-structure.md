# โครงสร้างไฟล์ปัจจุบัน

```text
Prod-Noodle/
├── src/
│   ├── App.tsx, main.tsx             # Customer entry + lazy staff screen
│   ├── api.ts                       # Demo/Supabase adapter, Auth, Realtime
│   ├── domain.ts                    # Types, pricing, validation, reports
│   ├── catalog.ts                   # เมนูต้นฉบับ 38 รายการ; live มี Owner เพิ่มเอง
│   ├── pages/
│   │   ├── Customer.tsx             # QR session + customer order status
│   │   ├── Ordering.tsx             # Shared customer/POS menu and cart
│   │   ├── Staff.tsx                # Login, screen composition, staff actions
│   │   ├── Dashboard.tsx            # Charts and CSV
│   │   ├── MenuEditor.tsx           # Owner menu creation/editing
│   │   └── TakeawayForm.tsx         # Shared takeaway/delivery details
│   ├── staff/
│   │   ├── Ticket.tsx               # Kitchen/POS order card
│   │   ├── Delivery.tsx             # Daily summary entry and CSV import
│   │   ├── Accounts.tsx             # Staff profile display
│   │   ├── QrCards.tsx, qr.ts       # Ten persistent links and owner controls
│   │   ├── sounds.ts                # Bell/receipt cues and audio lifecycle
│   │   ├── state-sync.ts            # Per-login snapshots + incremental updates
│   │   └── order-updates.ts         # Reject out-of-order Realtime reads
│   └── styles/                      # UI and accessibility styles
├── preview/                         # Standalone HTML entry and mock API
├── preview.html                     # Generated, intentionally tracked
├── server/demo.mjs                  # Localhost API and demo persistence
├── supabase/
│   ├── migrations/                  # Nine immutable deployed migrations
│   ├── seed.sql, menu-seed.sql       # Bootstrap tables/options/menu
│   ├── queries/sales_reports.sql
│   └── functions/
│       ├── public-api/              # Catalog/QR session
│       ├── customer-api/            # Own orders and retry-safe submission
│       ├── staff-api/               # JWT/role checks and guarded mutations
│       └── _shared/                 # Auth/CORS helpers; deferred voice samples
├── public/                          # PWA, icons, Pages headers, CSV template
├── scripts/                         # Dev/setup/build, seeds/icons, pilot tests
├── tests/
│   ├── *.test.ts, *.test.mjs         # Domain, HTTP, PGlite, audio/state regressions
│   └── browser/                     # Controlled-API Chromium regressions
├── docs/
│   ├── history/                     # Dated handoffs; not current setup steps
│   ├── reports/                     # Review and live-test evidence
│   └── previews/                    # Reference screenshots
└── AGENTS.md, README.md, HANDOFF.md   # Rules, setup guide, current continuation
```

Database writes go through server-validated transactional RPCs. Customers cannot read the order tables directly; staff reads use JWT/RLS. Orders and table sessions use Realtime. The local demo and HTML mock share the UI but do not represent production authentication or sales.

Keep staff-specific components/helpers together in `src/staff/`; keep shared customer/POS components in `src/pages/`. Update `preview/api.ts` when mock API behavior changes and regenerate `preview.html` after UI changes. Do not edit the generated HTML directly.

`.local-data/`, dependencies, build output, browser reports, real `.env` files and local sales stay ignored. Applied migrations remain in place with their original contents. For a new database, follow the explicit seed/migration order in [cloud setup](cloud-setup.md); do not run that setup against the live pilot.

Use [README](../README.md) for commands and [HANDOFF](../HANDOFF.md) for current status. [The architecture baseline](architecture-baseline.md) contains older plans and deferred features.
