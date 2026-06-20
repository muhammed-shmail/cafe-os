# ChayaOne — Platform Architecture

> **ChayaOne** is the multi-tenant SaaS brand for the **Cafe OS** product, operated by **Nuro7**.
> Not a POS — a retention engine that happens to bill. This document is the single,
> authoritative, **as-built** picture of the running system, with multi-tenancy and RBAC as
> first-class concerns.

This is the master architecture overview. It describes what is *actually deployed today*, not an
aspirational target. Where the codebase diverges from the older `02-TECH-ARCHITECTURE.md` brief,
**this document wins** (see §2). Deep detail lives in the numbered docs — this file is the index
that ties them together. Naming: **ChayaOne** = the platform/brand customers buy, **Cafe OS** =
the product/codebase, **Nuro7** = the company that operates the control plane.

---

## 1. Overview & The Four Surfaces

ChayaOne turns the 8–12 minutes a customer spends waiting for an order into a gamified,
point-earning, socially-connected loop that drives return visits — while giving the owner a full
POS, inventory, staff, loyalty, and AI-analytics stack underneath. One Next.js app serves four
distinct surfaces from one codebase and one database.

| # | Surface | Route | Who | What it does |
|---|---------|-------|-----|--------------|
| 1 | **Tablet POS** | `/pos` | Staff (cashier / waiter) | Billing, KOT, payments, GST. Fast, offline-tolerant. |
| 2 | **Kitchen Display (KDS)** | `/kds` | Kitchen | Live ticket queue, prep status, station routing. |
| 3 | **Customer PWA** | `/app` | Customers (public) | Scan-to-engage: order status, games, points, rewards. |
| 4 | **Owner Dashboard** | `/dashboard` | Owner / Manager | Analytics, inventory, staff, CRM, AI assistant, settings. |

A fifth surface — the **Nuro7 Super-Admin control plane** (`/admin`, `admin.chayaone.com`) — is
specified in [10-SAAS-CONTROL-PLANE.md](10-SAAS-CONTROL-PLANE.md) and summarised in §9. It is
additive and does not change any of the four surfaces above.

```
   ┌──────────┐   ┌──────────┐   ┌──────────────┐   ┌─────────────────┐
   │ Tablet   │   │   KDS    │   │ Customer PWA │   │ Owner Dashboard │
   │ POS /pos │   │  /kds    │   │    /app      │   │   /dashboard    │
   └────┬─────┘   └────┬─────┘   └──────┬───────┘   └────────┬────────┘
        └──────────────┴────────────────┴────────────────────┘
                                  ▼
                    one Next.js 14 app  ·  one PostgreSQL
```

---

## 2. Ground Truth — As-Built vs Aspirational

The original `02-TECH-ARCHITECTURE.md` brief specified a NestJS + Socket.IO + AWS + Redis + S3
stack. **The product is none of those.** It was built as a Next.js monorepo and ships on Railway.
This table is the reconciliation; everything else in this document follows the **Reality** column.

| `02-TECH` brief | Reality in this repo | Status |
|---|---|---|
| NestJS backend | **Next.js Route Handlers** (`app/api/**/route.ts`) | ✅ as-built |
| Socket.IO + Redis adapter | **Server-Sent Events** (`lib/realtime.ts`, in-process bus) | ✅ as-built |
| AWS ECS / EKS | **Docker on Railway** (`Dockerfile.railway`, `railway.toml`) | ✅ as-built |
| Redis (cache, leaderboards, rate-limit) | Not present yet | 🔨 future-scale (§15) |
| AWS S3 (assets) | Upload route exists; object-store target TBD | 🔨 |
| React Native owner app | Not built; owner uses the web dashboard | 🔨 |
| "Add `tenant_id` to every table" | **Already done** — `Tenant`/`Outlet` + `tenantId`/`outletId` throughout | ✅ |

**The load-bearing fact:** the data layer is already multi-tenant. The remaining SaaS work is the
*control plane* (sell, provision, meter, govern tenants) plus closing the runtime-isolation gaps a
single-tenant dev scaffold left open — see §8–§9 and [10](10-SAAS-CONTROL-PLANE.md).

---

## 3. Stack (as-built)

| Layer | Technology | Notes |
|-------|-----------|-------|
| Web + API | **Next.js 14.2** App Router + Route Handlers | One app; SSR + API in the same process |
| Language | **TypeScript 5.6** (strict) | End-to-end types via workspace packages |
| UI runtime | **React 18.3** | Server + client components |
| Styling | **Tailwind CSS 3.4** + shared preset | "Roasted Daylight" tokens (§16) |
| ORM / DB | **Prisma 5.20** → **PostgreSQL (Neon)** | Pooled + direct URLs; integer-paise money |
| Auth | **`jose` 5.9** JWT (HS256), httpOnly cookie | Edge-verifiable in middleware |
| Validation | **Zod 3.23** | DTOs / API contracts (`@cafeos/core`) |
| Icons | **lucide-react 1.21** | — |
| Realtime | **Server-Sent Events** + in-process `EventEmitter` | `lib/realtime.ts`; per-outlet channel |
| Payments | **Razorpay** (UPI / cards) | Webhook via Route Handler |
| Messaging | **WhatsApp Cloud API** | Campaigns |
| AI | **Google Gemini** | Dashboard assistant (server-side) |
| Local dev DB | **embedded-postgres** | Disposable Postgres for local work |
| Deploy | **Docker on Railway**, Postgres on **Neon** | §14 |
| Cache / queues / Socket.IO | — | 🔨 add only where they earn their keep (§15) |

---

## 4. Monorepo Layout

Turborepo + npm workspaces (`turbo ^2.1`, `npm@10.8`, Node ≥20). One app, three internal packages,
linked by `@cafeos/*` aliases (`tsconfig.base.json`) — no publishing.

```
platform/
├── package.json            workspaces: apps/*, packages/*  ·  turbo tasks
├── turbo.json
├── tsconfig.base.json      @cafeos/* path aliases
├── apps/
│   └── web/                @cafeos/web — the Next.js app (all four surfaces + /api)
│       ├── app/            App Router pages + Route Handlers
│       ├── lib/            server logic: auth, rbac, context, realtime, tax, inventory, crm, pwa, games/
│       ├── components/     React UI incl. games/ and BrandMark
│       └── middleware.ts   edge session gate
└── packages/
    ├── db/                 @cafeos/db   — Prisma client singleton + schema + migrations + seed + rls.sql
    ├── core/               @cafeos/core — gst.ts, money.ts, units.ts, dto.ts (pure logic, no I/O)
    └── ui/                 @cafeos/ui   — Tailwind preset + Luxe tokens + shared components
```

| Package | Owns | Key files |
|---|---|---|
| `@cafeos/db` | Prisma client, schema, migrations, seed, RLS | `prisma/schema.prisma`, `prisma/rls.sql` |
| `@cafeos/core` | GST engine, paise math, unit conversion, DTOs | `src/gst.ts`, `src/money.ts`, `src/units.ts` |
| `@cafeos/ui` | Design tokens + Tailwind preset + primitives | `tailwind-preset.ts`, `tokens.css` |

---

## 5. System Diagram (logical, as-built)

One process. The four surfaces are routes in the same Next.js app; the API is Route Handlers in the
same app; Prisma talks to Neon Postgres; SSE is an in-process fan-out, not a separate gateway.

```
   Tablet POS   KDS   Customer PWA   Owner Dashboard          (browsers / tablets)
        │        │         │               │
        └────────┴────┬────┴───────────────┘
                      ▼
        ┌───────────────────────────────────────────────┐
        │            NEXT.JS 14  (Railway, 1 process)     │
        │  middleware.ts ── edge JWT gate on /pos /kds    │
        │                   /dashboard                    │
        │  app/**           page render (4 surfaces)      │
        │  app/api/**       Route Handlers (REST)         │
        │  lib/realtime.ts  in-process EventEmitter ─► SSE│──► /api/stream, /api/customer/stream
        └───────────────────────┬─────────────────────────┘
                                ▼  Prisma 5.20
                  ┌──────────────────────────────┐
                  │  PostgreSQL (Neon)            │
                  │  pooled URL (app)             │
                  │  direct URL (migrations)      │
                  └──────────────────────────────┘
   External (server-side only):  Razorpay   ·   WhatsApp Cloud API   ·   Google Gemini
```

---

## 6. Request, Auth & Session

Two principal types, **never sharing an identity table** — this separation is the backbone of both
RBAC (§7) and the control plane (§9).

- **Staff** (POS / KDS / Dashboard) — PIN login → `jose` HS256 JWT in an httpOnly cookie
  (`lib/auth.ts`). The `Session` carries `staffId`, `name`, `role`, `tenantId`, `outletId`.
  `middleware.ts` verifies the token at the edge and gates `PROTECTED = ['/pos','/kds','/dashboard']`,
  redirecting to `/login?next=…` when absent. The PIN is fine for fast POS login; a platform admin
  (§9) will use password + TOTP instead.
- **Customer** (PWA `/app`) — public; identity is established by QR-token context and phone
  registration (`/api/customer/register`, `/api/customer/context`). No staff session required.

```
  Staff request ─► middleware.ts ─► token? ──no──► /login?next=…
                                      │yes
                                      ▼
                              verifySession() (jose)  →  Session{ role, tenantId, outletId }
                                      ▼
                          page redirect / Route Handler
                                      ▼
                         RBAC surface + capability check (lib/rbac.ts)   ← §7
                                      ▼
                         query under tenant scope (RLS)                  ← §8
```

The token is signed, so the client can neither forge `tenantId` nor escalate `role` — every
server check trusts the claim, not a header or body field.

---

## 7. RBAC (Role-Based Access Control)

The single source of truth is **`apps/web/lib/rbac.ts`** (Phase F). It is enforced on the server
(page redirects + API gating) and mirrored on the client for menu/UI visibility. The persisted
`StaffRole` enum is unchanged; RBAC labels and gates it.

### 7.1 Role hierarchy

Five staff roles, mapping onto SaaS Levels 2–4. **Level 1 (Nuro7 Super Admin) is a separate
principal type** (`PlatformAdmin`, §9) — not a `StaffRole` — so platform identity and tenant
identity never share a table.

| SaaS level | Role (`StaffRole`) | Label | Scope |
|---|---|---|---|
| **1** | `PlatformAdmin` 🔨 (§9) | Super Admin (Nuro7) | the whole platform, above all tenants |
| **2** | `owner` ✅ | Admin (Owner) | one tenant, all outlets |
| **3** | `manager` ✅ | Administrator (Manager) | floor + back-office; manages floor staff |
| **4** | `cashier` ✅ | Cashier | till + kitchen view |
| **4** | `waiter` ✅ | Waiter | till + QR approvals |
| **4** | `kitchen` ✅ | Kitchen | kitchen display only |

```
PlatformAdmin (Nuro7)        ← cross-tenant, platform only (§9)
   ┊  operates tenants; not a god-mode reader of a cafe's private data
owner            ← everything in one tenant, all outlets
   └── manager   ← floor + back-office of assigned outlet(s); manages floor staff
         ├── cashier   ← POS + KDS view
         ├── waiter    ← POS + QR approvals
         └── kitchen   ← KDS only
```

### 7.2 Surface access matrix

Straight from the `ACCESS` map in `lib/rbac.ts` — which roles may reach each surface:

| Surface | owner | manager | cashier | waiter | kitchen |
|---|:--:|:--:|:--:|:--:|:--:|
| `/dashboard` | ✅ | ✅ | — | — | — |
| `/pos` | ✅ | ✅ | ✅ | ✅ | — |
| `/kds` | ✅ | ✅ | ✅ | — | ✅ |
| `/approvals` | ✅ | ✅ | ✅ | ✅ | view-only |

`landingFor(role)` routes each role on login: `kitchen → /kds`, any POS-capable role `→ /pos`,
otherwise `→ /dashboard`.

### 7.3 Staff-management capabilities

| Capability | owner | manager | cashier / waiter / kitchen |
|---|:--:|:--:|:--:|
| `canManageStaff` (create/edit users) | ✅ | ✅ | — |
| `assignableRoles` (which roles they may grant) | all 5 | cashier/waiter/kitchen only | — |
| `canManageTarget` (who they may edit/deactivate) | anyone | cashier/waiter/kitchen only | — |

A manager can run the floor and create floor staff, but **cannot mint or edit owners/managers** —
the deliberate guard in `assignableRoles()` / `canManageTarget()`.

### 7.4 How it's enforced

- **Server pages** call `canAccess(role, surface)` and redirect on failure.
- **API handlers** re-check the same map (never trust the client's hidden UI).
- **Client UI** hides menu items the role can't use — convenience, not security.
- **The control plane (§9)** extends this with a parallel `platform-rbac.ts` for Level-1; the §7
  matrix above is left untouched.

---

## 8. Multi-Tenancy & Isolation

The data layer is **already multi-tenant**: a `Tenant` (cafe brand) has many `Outlet`s (physical
locations); every tenant-scoped row carries `tenantId`, every outlet-scoped row carries `outletId`.
The remaining work is making isolation hold at *runtime*, not just in the schema.

```
Tenant (cafe brand)  1───*  Outlet (location)  1───*  Order / MenuItem / StockItem / …
   │                            │
   └─ tenantId on tenant tables └─ outletId on outlet-scoped tables
```

### 8.1 Tenant resolution — the #1 correctness gap

| | Today | Target (per [10](10-SAAS-CONTROL-PLANE.md), phase G2) |
|---|---|---|
| Staff | session `tenantId`/`outletId` ✅ | unchanged |
| Public / PWA | `getActiveOutlet()` returns `prisma.outlet.findFirst({orderBy:{name:'asc'}})` 🔨 | resolve **subdomain → `Tenant.subdomain`** (`kaava.chayaone.com`) in `middleware.ts`, forward `x-tenant-id` |
| Schema | `Tenant` has **no** `subdomain` field yet 🔨 | add `subdomain String @unique` |

`getActiveOutlet()` in `lib/context.ts` is honest about being a dev scaffold ("returns the seeded
outlet"). It is correct for one tenant and unsafe for many — replacing it with host/session
resolution is the foundation everything else (billing, slots, admin) sits on.

### 8.2 Row-Level Security — the hard boundary

Isolation is **defence-in-depth**: an application-layer tenant scope *and* Postgres Row-Level
Security, so a single forgotten `WHERE` can't leak across tenants. The app sets a per-request GUC
and policies scope every read/write to it (`prisma/rls.sql`):

```sql
-- app sets this once per request/connection:
--   SELECT set_config('app.current_tenant', '<tenant-uuid>', false);

CREATE POLICY tenant_isolation_customers ON customers
  USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

CREATE POLICY tenant_isolation_orders ON orders
  USING (outlet_id IN (
    SELECT id FROM outlets WHERE tenant_id = current_setting('app.current_tenant', true)::uuid
  ));
```

So `SELECT * FROM orders` returns only the caller's rows even with no explicit `WHERE` — the policy
is attached to the table. The app role connects as **non-`BYPASSRLS`**; the migrator role is
`BYPASSRLS`.

| RLS status | Detail |
|---|---|
| ✅ partial | Enabled on `orders`, `order_items`, `payments`, `customers`, `loyalty_ledger` (scaffold/example) |
| 🔨 | Extend to **all** tenant tables; denormalise `tenant_id` onto hot outlet-scoped tables to avoid join-in-policy; wrap every tenant request in `SET app.current_tenant` via a `withTenant()` helper |

This gap — scaffold → full coverage + non-bypass app role — is the difference between
"multi-tenant data model" (have it) and "multi-tenant *secure*" (the work in phase G3).

---

## 9. Control Plane & Subscriptions (Nuro7)

Two logical planes, one codebase, one database. The split is **schema + middleware**, not
infrastructure — which is what keeps the four surfaces untouched.

```
                    ┌──────────────────────────────────────────────┐
 admin.chayaone.com │           NURO7 CONTROL PLANE                 │
        ───────────►│  /admin · /api/admin · PlatformAdmin identity │
                    │  tenant lifecycle · subscriptions · slots ·   │
                    │  feature flags · platform analytics · tickets │
                    └───────────────────┬──────────────────────────┘
                                        │ writes plan / limits / flags
                                        ▼
                    ┌──────────────────────────────────────────────┐
 *.chayaone.com ───►│   TENANT PLANE  (the four surfaces, unchanged)│
   middleware       │   gated by: session.role ✕ subscription ✕ flag│
   resolves sub →   └───────────────────┬──────────────────────────┘
   tenantId → RLS                       ▼
                    ┌──────────────────────────────────────────────┐
                    │  PostgreSQL — one DB, RLS-isolated by tenant  │
                    │  control-plane tables (no RLS) + tenant tables│
                    └──────────────────────────────────────────────┘
```

The control plane is **all additive** (new models, new routes, new `/admin` surface). It adds:

- **`PlatformAdmin`** — Level-1 identity (password + TOTP, separate JWT secret/cookie). Never
  reachable by a tenant token.
- **`Subscription` + `PlanDefinition`** — plan × period × status × dates. Plans are *data*, so Nuro7
  launches/edits tiers without a deploy. The existing flat `Tenant.plan` stays as a read-through.
- **Slots / quotas** — `UsageCounter` meters (branches, staff, customers, monthly orders, storage)
  incremented in the same transaction as the entity insert; a single `assertSlot(tenantId, metric)`
  guard at the few write paths that consume a slot (→ `402` + upsell on exceed).
- **Feature flags & white-label** — per-plan feature gates; `TenantBranding` for Enterprise
  (custom domain / logo / colors / "Powered by ChayaOne" toggle).
- **Status gating** — `suspended`/`expired` tenants hit a read-only billing wall on every surface
  (one middleware check); their data is preserved, never deleted.

**[10-SAAS-CONTROL-PLANE.md](10-SAAS-CONTROL-PLANE.md) is the authority** for the control plane —
full Prisma models, the `/api/admin/*` contract, the onboarding workflow, and the phased roadmap
(Phase G). This section is the summary; that doc is the spec.

---

## 10. Data Model

A multi-tenant PostgreSQL schema (`packages/db/prisma/schema.prisma`). **All money is integer
paise** — never floats. Several tables are **append-only ledgers** for audit integrity. Full DDL
lives in [03](03-DATABASE-SCHEMA.md); this is the map.

| Domain | Core models | Notes |
|--------|-------------|-------|
| Tenancy & Identity | `Tenant`, `Outlet`, `StaffUser`, `Role` | `Plan` enum `starter/growth/pro/enterprise` |
| Catalog | `Category`, `MenuItem`, `ModifierGroup`, `Modifier`, `Combo` | `pricePaise`, `hsnCode`, `gstRate`, `station` |
| Orders | `Order`, `OrderItem`, `Kot`, `Payment`, `Refund` | `clientUuid` idempotency; station-routed KOTs |
| Inventory & Supply | `StockItem`, `Recipe`, `StockLedger`, `WasteLog`, `Vendor`, `PurchaseOrder`, `SupplierPayment` | recipe = BOM; ledger append-only |
| Staff Ops | `Attendance`, `Shift`, `SalaryPayment`, `AuditLog` | `AuditLog` append-only |
| Customers & Loyalty | `Customer`, `LoyaltyLedger`, `RewardCatalog`, `Coupon` | tiers bronze→vip; `LoyaltyLedger` append-only |
| Gamification & Social | `Game`, `GameSession`, `GameRoom`, `GameRoomPlayer`, `Badge`, `CustomerBadge`, `Leaderboard`, `Streak`, `Referral` | server-authoritative rewards |
| Campaigns | `Segment`, `Campaign`, `CampaignSend` | WhatsApp / SMS / push |
| Analytics | `DailySalesRollup`, `ItemSalesRollup` | precomputed rollups (§15) |
| Operations | `Notification` | low-stock / system alerts to the owner bell |

Core order path (ER sketch):

```
Tenant 1─* Outlet 1─* Order 1─* OrderItem *─1 MenuItem
                       Order 1─* Kot             MenuItem 1─* Recipe *─1 StockItem
                       Order 1─* Payment         StockItem 1─* StockLedger
                       Order 1─* Refund
```

---

## 11. Feature Modules (as-built)

Each module is summarised with its real entry points and status. Detail lives in the numbered docs.

### 11.1 Orders / KOT / Billing  ✅
The bill is computed by a **single function** used on both client and server so the POS cart and the
saved order can never disagree: `computeBill(lines, opts)` in `packages/core/src/gst.ts` (returns
subtotal, discount, CGST/SGST/IGST, service charge, round-off, total — all paise). Order creation
(`app/api/orders/route.ts`) is **idempotent on `clientUuid`** and writes order + items + KOTs +
payment in one transaction. KOTs are routed per `station` (kitchen / bar / dessert).

### 11.2 GST engine & per-outlet toggle  ✅
GST config is stored flat in `Outlet.settings.gst` and read by `lib/tax.ts` (`readGstConfig`,
`getOutletGst`, `gstBillOptions`). It supports on/off (**default OFF** until an outlet opts in via
Settings → Tax & GST), a flat rate override, and inclusive vs. exclusive pricing. `gstBillOptions()`
feeds straight into `computeBill()`, so the toggle flows through every billing path.

### 11.3 Inventory & recipe auto-deduct  ✅ (Phase A)
On sale, `applyRecipeConsumption()` (`lib/inventory.ts`) translates sold menu items into raw-material
consumption via their `Recipe` rows, decrements `StockItem` in the order transaction, and appends a
`StockLedger` entry (`reason="sale"`). It never blocks a sale; depletion surfaces through
`emitLowStockAlerts()` → `Notification`. `reverseRecipeConsumption()` backs it out on void/refund.

### 11.4 Customer PWA  ✅
`app/app/PwaClient.tsx` is the customer shell (Home / Order / Play / Rewards). Behaviour is driven by
`Outlet.settings.pwa` via `lib/pwa.ts` (registration, theme, wallet, loyalty, gamification gating).
Live order status streams over SSE from `app/api/customer/stream`.

### 11.5 Loyalty & CRM  ✅
The admin Customer Management dashboard (`app/dashboard/CustomerManagement.tsx`) is a read-surface
over `lib/crm.ts` (`listCustomers`, `getCustomerProfile`, `getCustomerTimeline`,
`getCustomerAnalytics`). Wallet balance is **points-equivalent** under the outlet's conversion rate;
every points movement is an append-only `LoyaltyLedger` row.

### 11.6 Quick Cafe Games  ✅
`lib/games/registry.ts` is the single source of truth for the game catalogue and reward maths,
imported by **both** client and server. Play is **server-authoritative**:
`app/api/customer/games/complete` enforces the per-visit reward cap and writes the `LoyaltyLedger`
payout. UI lives in `components/games/*` (Imposter, Emoji Guess, Word Challenge, Quiz, Spot
Difference, Memory Flip). See [10-QUICK-CAFE-GAMES.md](10-QUICK-CAFE-GAMES.md).

### 11.7 Campaigns & AI  ✅ / partial
`Segment` → `Campaign` → `CampaignSend` model WhatsApp / SMS / push outreach to cohorts. The
dashboard AI assistant (`app/api/dashboard/assistant`) calls **Google Gemini server-side only** (keys
never on the client) using tool/function-calling back into our own analytics. See
[06](06-RETENTION-AND-AI.md).

---

## 12. Realtime & Offline

**Realtime** is intentionally simple. `lib/realtime.ts` is an in-process `EventEmitter` bus keyed by
`outlet:${outletId}`; order handlers `publish()`, and SSE endpoints (`/api/stream`,
`/api/customer/stream`) `subscribe()` and stream to browsers. Event types: `order.new`,
`order.updated`, `order.pending` (Phase-C QR approval), `notify` (owner bell). The KDS reacts only to
`order.new`/`order.updated`; the customer stream filters by table — so each consumer ignores events
not meant for it.

> Horizontal scale is a **one-edit swap**: replace `publish`/`subscribe` with Redis pub/sub
> (ioredis); the call sites don't change. 🔨 (§15)

**Offline-tolerant POS:** orders carry a `clientUuid` and the create endpoint is idempotent on it, so
a replayed/queued order reconciles to one canonical row. Cash settles fully offline; UPI/card need
connectivity.

---

## 13. Security Architecture

Defence in depth — a failure at any one layer does not expose another tenant's data, because the
database itself (Layer 5) is an independent last line.

```
Layer 1  Auth        — valid signed jose JWT required (httpOnly cookie); edge-verified.
Layer 2  Tenant gate — suspended/expired tenants blocked (billing wall, §9).            🔨
Layer 3  RBAC gate   — surface + capability check from lib/rbac.ts (§7).                ✅
Layer 4  Outlet gate — outlet-scoped roles limited to their outlet(s).                  ✅
Layer 5  RLS (DB)    — every row filtered by app.current_tenant, app code or not (§8).  ✅ partial → 🔨
Layer 6  Server math — money/loyalty computed server-side (computeBill); never trusted. ✅
Layer 7  Audit       — privileged actions logged (AuditLog; PlatformAudit in §9).       ✅ / 🔨
```

| Control | Status | Notes |
|---|---|---|
| Staff auth | ✅ | `jose` HS256 JWT, httpOnly cookie, edge-verified in `middleware.ts` |
| RBAC | ✅ | `lib/rbac.ts` owner/manager/cashier/waiter/kitchen (§7) |
| Tenant isolation (RLS) | ✅ partial → 🔨 | `prisma/rls.sql` scaffold (5 tables); extend to all + non-`BYPASSRLS` app role |
| Runtime tenant resolution | 🔨 | replace `getActiveOutlet()` stub with subdomain/session resolution (§8.1) |
| Card data | ✅ | none stored — Razorpay tokenization; only payment references kept |
| PII | ✅ | phone hashed for lookups |
| Audit | ✅ tenant / 🔨 platform | per-outlet `AuditLog`; platform audit ships with the control plane |
| Rate limiting | 🔨 | per-IP/account on login, QR-order, billing webhook (in-memory now, Redis at scale) |
| Super-admin auth | 🔨 | separate `PlatformAdmin` (password + TOTP), separate JWT secret/cookie |

RLS is intended as the **load-bearing** isolation boundary; application checks are defence-in-depth.

---

## 14. Deployment

Docker on Railway, Postgres on Neon. Build is a single image; no separate API service.

```toml
# railway.toml
[build]
builder = "dockerfile"
dockerfilePath = "Dockerfile.railway"

[deploy]
startCommand = "npm run -w @cafeos/web start -- --port 3000"
```

```dockerfile
# Dockerfile.railway (essentials)
FROM node:20-slim                 # Debian — Prisma engine needs OpenSSL
RUN apt-get install -y openssl ca-certificates
COPY platform/ .                  # package.json, turbo.json, apps/, packages/
RUN npm ci
RUN npm run db:generate && npm run build
EXPOSE 3000
```

Build flow: `npm ci` → `npm run db:generate` (Prisma client; `debian-openssl-3.0.x` engine target)
→ `npm run build` (Turbo builds all packages + web) → `next start` on **:3000**. RLS is applied as a
release step: `psql "$DIRECT_URL" -f packages/db/prisma/rls.sql`.

| Env var | Purpose |
|---|---|
| `DATABASE_URL` | Neon **pooled** connection (app runtime, non-`BYPASSRLS` role) |
| `DIRECT_URL` | Neon **direct** connection (migrations only, `BYPASSRLS`) |
| `JWT_SECRET` | Staff session signing |
| `RAZORPAY_*` | Payments + webhook verification |
| `GEMINI_API_KEY` | Dashboard AI assistant |
| `WHATSAPP_TOKEN` | Campaign delivery |
| `PLATFORM_JWT_SECRET` 🔨 | Super-admin session (separate from staff) (§9) |

See [DEPLOYMENT.md](DEPLOYMENT.md) for the full runbook. DNS target: a wildcard
`*.chayaone.com → Railway` (one cert); `admin.chayaone.com` is just another subdomain, gated in
middleware; Enterprise custom domains via per-tenant CNAME + on-demand TLS.

---

## 15. Scaling Path

The current shape comfortably serves the near-term target; growth is incremental, not a rewrite.

1. **Vertical Postgres** first — Neon scales up before out.
2. **Read replicas** for analytics-heavy dashboard queries.
3. **Precomputed rollups** already exist (`DailySalesRollup`, `ItemSalesRollup`) so dashboards never
   aggregate on the hot path.
4. **Add Redis** only where it earns its place: leaderboards (sorted sets), distributed rate-limit,
   tenant-resolution cache, and the realtime fan-out (swap the in-process bus for Redis pub/sub —
   §12). 🔨
5. **Partition hot tables by tenant**; promote a noisy-neighbour tenant to a dedicated DB (the
   `Subscription` row already identifies which).
6. **Kubernetes / multi-region** is a future lever — not needed to serve thousands of cafes from
   Railway + managed Postgres.

---

## 16. Design Language (Luxe)

One visual language across all four surfaces, defined once in `packages/ui` and consumed via the
shared Tailwind preset. The palette is **"Roasted Daylight"** (`tailwind-preset.ts`): paper/ink/line
neutrals plus warm accents (`turmeric`, `cardamom`, `clay`, `berry`) and a **gold** accent layer
(`--gold` / `--gold-d` / `--gold-l`). Typography uses a **Cormorant** serif display face wired through
`--font-display`, with body and mono families alongside. Dark-roast mode for the KDS is a CSS-variable
remap under `[data-skin="roast"]` in `tokens.css` — no component changes. Brand chrome (logo +
AlphaTag) lives in `components/BrandMark.tsx`. The Super-Admin console (§9) reuses the same language
in a denser data-grid layout, so the platform feels like one product.

---

## 17. Roadmap Pointer

Feature work ships in phases A–F; the SaaS control plane is **Phase G**. This doc does not duplicate
those plans — it points to them.

| Track | Phase | Owner doc |
|---|---|---|
| Feature roadmap & MVP slices | A–F | [09-ROADMAP-MVP.md](09-ROADMAP-MVP.md) |
| Recipe auto-deduct / inventory | A (done) | §11.3 · [03](03-DATABASE-SCHEMA.md) |
| RBAC | F (done) | §7 · `lib/rbac.ts` |
| Gamification & social | — | [05-GAMIFICATION-AND-SOCIAL.md](05-GAMIFICATION-AND-SOCIAL.md), [10-QUICK-CAFE-GAMES.md](10-QUICK-CAFE-GAMES.md) |
| Retention & AI | — | [06-RETENTION-AND-AI.md](06-RETENTION-AND-AI.md) |
| Multi-tenancy & control plane (Nuro7) | G | §8–§9 · [10-SAAS-CONTROL-PLANE.md](10-SAAS-CONTROL-PLANE.md) |

**Recommended first control-plane slice:** schema migration + `Tenant.subdomain` → tenant resolution
(retire `getActiveOutlet()`) → full RLS coverage. That turns "multi-tenant in shape, single-tenant in
runtime" into a genuinely isolated platform — the foundation billing, admin, and slots sit on.

---

## Appendix — Source-of-truth pointers

This file is the index; each concern is *owned* by exactly one place so the docs don't drift.

| Concern | Authority |
|---|---|
| Product vision & personas | [01-PRD.md](01-PRD.md) |
| (Aspirational) original tech brief | [02-TECH-ARCHITECTURE.md](02-TECH-ARCHITECTURE.md) — superseded by §2–§5 here for as-built |
| Full database DDL | [03-DATABASE-SCHEMA.md](03-DATABASE-SCHEMA.md) · `packages/db/prisma/schema.prisma` |
| API & event contract | [04-API-STRUCTURE.md](04-API-STRUCTURE.md) · `app/api/**` |
| RBAC | `apps/web/lib/rbac.ts` (`ACCESS`, `assignableRoles`, `canManageTarget`) |
| Multi-tenancy & RLS | `packages/db/prisma/rls.sql` · `apps/web/lib/context.ts` |
| Tenant resolution & control plane | [10-SAAS-CONTROL-PLANE.md](10-SAAS-CONTROL-PLANE.md) |
| GST math | `packages/core/src/gst.ts` (`computeBill`) · `apps/web/lib/tax.ts` |
| Realtime | `apps/web/lib/realtime.ts` |
| Deployment runbook | [DEPLOYMENT.md](DEPLOYMENT.md) · `Dockerfile.railway` · `railway.toml` |
| Design tokens | `packages/ui/tailwind-preset.ts` · `tokens.css` |
