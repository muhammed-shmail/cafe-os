# 10 — SaaS Control Plane (Nuro7 Platform Layer)

> How **Chaya One Cafe OS** becomes a true multi-tenant SaaS — a platform Nuro7 operates,
> selling isolated cafe workspaces on metered subscription plans — **without rewriting a
> single existing feature**.

This document is the architecture deliverable for the SaaS transformation. It is written
**against the real codebase**, not a greenfield assumption. Read §0 first: it corrects two
load-bearing assumptions in the original brief, and everything else follows from it.

---

## 0. Ground Truth (read this before anything else)

The transformation brief specified a tech stack of *React/Vite + Express + Socket.IO + Redis
+ Kubernetes*. **The actual product is none of those.** Forcing that stack would delete
every working surface — which directly violates the brief's own CRITICAL RULES ("DO NOT
break existing integrations / workflows / business logic").

| Brief assumed | Reality in this repo | Decision |
|---|---|---|
| React + Vite SPA | **Next.js 14 App Router** (`platform/apps/web`) | Keep. Extend with route groups. |
| Express.js API | **Next.js Route Handlers** (`app/api/**/route.ts`) | Keep. Add `app/admin` + `/api/admin`. |
| Socket.IO realtime | **Server-Sent Events** (`/api/stream`, `lib/realtime.ts`) | Keep. SSE is sufficient; no Socket.IO. |
| Redis cache/leaderboard | Not present yet (noted as TODO for rate-limit + leaderboards) | **Optional**, add only where it earns its keep (§11). |
| Kubernetes | **Docker on Railway** (`Dockerfile`, `railway.toml`) | Keep. K8s is a future-scale option, not now. |
| "Add tenant_id to every table" | **Already done** — `Tenant`/`Outlet` + `tenantId`/`outletId` everywhere | Reuse. Don't re-model. |

**The single most important fact:** the data layer is *already multi-tenant*. The work is not
"add multi-tenancy" — it is "add the **control plane** that lets Nuro7 sell, provision, meter,
and govern tenants," plus closing the runtime isolation gaps that a single-tenant dev scaffold
left open.

### What already exists (✅) vs what we build (🔨)

| Capability | Status | Evidence / Gap |
|---|---|---|
| Tenant + Outlet data model, `tenantId` on all tenant tables | ✅ | `schema.prisma` `Tenant`, `Outlet`, FKs throughout |
| `Plan` enum (starter/growth/pro/enterprise) | ✅ partial | `Tenant.plan` exists — but no subscription lifecycle, dates, or limits |
| Staff RBAC = SaaS Levels 2–4 | ✅ | `lib/rbac.ts`: owner→Owner, manager→Branch Manager, cashier/waiter/kitchen→Staff |
| JWT session carries `tenantId` + `outletId` | ✅ | `lib/auth.ts` `Session`; set at login |
| Row-Level Security scaffold | ✅ partial | `prisma/rls.sql` — only 5 tables, examples only; not applied platform-wide |
| Realtime, POS, KDS, PWA, loyalty, inventory, games, CRM, GST | ✅ | full feature set under `app/**` |
| **Level-1 Super Admin (Nuro7) identity** | 🔨 | no platform-owner principal; `StaffRole` tops out at `owner` |
| **Subscription model** (plan × period × status × dates) | 🔨 | only a flat `Tenant.plan` field |
| **Slot / quota enforcement** (branches, staff, storage, customers, orders, QR) | 🔨 | no limits, no usage meters, no gate |
| **Tenant resolution at runtime** (subdomain → tenant) | 🔨 | `lib/context.ts` `getActiveOutlet()` returns the **first** outlet — fine for dev, unsafe for prod |
| **Feature flags / plan gating** | 🔨 | none |
| **Super Admin dashboard + tenant lifecycle** | 🔨 | none |
| **White-label** (domain/logo/colors) | 🔨 | `Outlet.settings` JSON holds PWA theme; no tenant-level branding/domain |
| **Support tickets, announcements, platform audit, 2FA, rate-limit** | 🔨 | none / TODO |

Everything below is **additive**. No existing model field is removed or renamed; no existing
route changes behaviour for existing roles.

---

## 1. SaaS Architecture Overview

Two planes, one codebase, one database. The split is logical (schema + middleware), not
physical — which is what keeps the existing app untouched.

```
                          ┌──────────────────────────────────────────────┐
                          │             NURO7 CONTROL PLANE                │
   admin.chayaone.com ──► │  Super Admin app  (app/admin, /api/admin)      │
                          │  • tenant lifecycle (create/suspend/delete)    │
                          │  • subscriptions, plans, slots, feature flags  │
                          │  • platform analytics (MRR/ARR, growth)        │
                          │  • support tickets, announcements, audit       │
                          └───────────────┬────────────────────────────────┘
                                          │ writes plan/limits/flags
                                          ▼
        ┌─────────────────────────────────────────────────────────────────┐
        │                        TENANT PLANE  (unchanged surfaces)         │
 *.chayaone.com ─► middleware resolves subdomain → tenantId → RLS context   │
        │                                                                   │
        │   /dashboard (Owner/Mgr)   /pos   /kds   /approvals   /app (PWA)   │
        │   gated by: session.role  ✕  subscription.status  ✕  featureFlag  │
        └─────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
        ┌─────────────────────────────────────────────────────────────────┐
        │  PostgreSQL — one DB, RLS-isolated by app.current_tenant          │
        │  Control-plane tables (platform_admins, subscriptions, plans,     │
        │  usage_counters, feature_flags, tickets…)  +  all tenant tables   │
        └─────────────────────────────────────────────────────────────────┘
```

**Isolation model:** shared database, shared schema, **Row-Level Security** as the hard
boundary, with an application-layer tenant interceptor as defence-in-depth. This is the
Petpooja/Toast-scale pattern and is already half-built here (`rls.sql`). Control-plane tables
are *not* tenant-scoped (no RLS) and are reachable only by Nuro7 principals.

---

## 2. Role Hierarchy & Permission Matrix

The brief's four levels map cleanly onto what exists. Only **Level 1 is new** — and it is a
*separate principal type*, not a new `StaffRole`, so tenant data and platform data never share
an identity table.

| Level | Principal | Storage | Resolves to |
|---|---|---|---|
| **1 — Super Admin (Nuro7)** | `PlatformAdmin` (🔨 new) | `platform_admins` (no tenant) | the whole platform |
| **2 — Tenant Owner** | `StaffUser` role `owner` ✅ | `staff_users` | one tenant, all outlets |
| **3 — Branch Manager** | `StaffUser` role `manager` ✅ | `staff_users` | assigned outlet(s) |
| **4 — Staff** | `cashier`/`waiter`/`kitchen` ✅ | `staff_users` | one outlet, scoped surfaces |

### Permission matrix (➕ = new gate to add; ✅ = already enforced in `lib/rbac.ts`)

| Capability | Super Admin | Owner | Manager | Staff |
|---|:--:|:--:|:--:|:--:|
| Create / suspend / delete **tenant** | ➕ | — | — | — |
| Assign plan / slots / feature flags | ➕ | — | — | — |
| Platform revenue & cross-tenant analytics | ➕ | — | — | — |
| Support tickets, announcements, system health | ➕ | — | — | — |
| Manage branches (outlets) within tenant | view | ✅ | — | — |
| Manage menu / inventory / suppliers / recipes | — | ✅ | ✅ | — |
| Manage staff & roles | — | ✅ (all) | ✅ (≤ staff)✅ | — |
| Subscription / billing for own cafe | — | ➕ | — | — |
| Orders / tables / KDS / customer check-in | — | ✅ | ✅ | ✅ |
| Tenant-level reports & loyalty/offers | — | ✅ | ✅ (view) | — |

`lib/rbac.ts` already encodes the Owner/Manager/Staff split (`ACCESS`, `assignableRoles`,
`canManageTarget`). We **extend** it with a parallel `platform-rbac.ts` for Level 1 and add
subscription/feature gates as middleware — we do not touch the existing matrix.

---

## 3. Database Schema Additions (Prisma)

Drop-in models for `platform/packages/db/prisma/schema.prisma`. All additive. Money stays
integer paise; UUIDs and `@db.Timestamptz(6)` match house convention.

```prisma
// ===================== 0. CONTROL PLANE (Nuro7) =====================

enum PlatformRole { super_admin   support   billing   readonly }
enum BillingPeriod { monthly      quarterly half_yearly yearly }
enum SubStatus     { trialing     active    past_due  suspended  cancelled  expired }
enum TicketStatus  { open in_progress waiting resolved closed }

model PlatformAdmin {
  id           String        @id @default(uuid()) @db.Uuid
  email        String        @unique
  name         String
  passwordHash String                       // argon2/bcrypt — NOT a 4-digit PIN
  role         PlatformRole  @default(super_admin)
  totpSecret   String?                       // 2FA (§10)
  active       Boolean       @default(true)
  lastLoginAt  DateTime?     @db.Timestamptz(6)
  createdAt    DateTime      @default(now()) @db.Timestamptz(6)

  actions      PlatformAudit[]
  tickets      SupportTicket[]  @relation("AssignedAdmin")
  @@map("platform_admins")
}

// A plan is a template of limits + features. Editable by Super Admin → no code deploy
// needed to launch a new tier or change a quota.
model PlanDefinition {
  id           String   @id @default(uuid()) @db.Uuid
  key          Plan     @unique              // reuse existing Plan enum: starter|growth|pro|enterprise
  name         String
  // null = unlimited (Enterprise)
  maxBranches  Int?
  maxStaff     Int?
  maxCustomers Int?
  maxOrdersMonthly Int?
  storageMb    Int?
  features     Json     @default("{}")       // { "whatsapp": true, "ai_assistant": false, "white_label": false, ... }
  pricePaise   Json     @default("{}")       // { "monthly": 99900, "yearly": 999000, ... } per BillingPeriod
  active       Boolean  @default(true)
  subscriptions Subscription[]
  @@map("plan_definitions")
}

model Subscription {
  id            String        @id @default(uuid()) @db.Uuid
  tenantId      String        @unique @db.Uuid      // one active subscription per tenant
  planId        String        @db.Uuid
  period        BillingPeriod @default(monthly)
  status        SubStatus     @default(trialing)
  trialEndsAt   DateTime?     @db.Timestamptz(6)
  currentStart  DateTime      @default(now()) @db.Timestamptz(6)
  currentEnd    DateTime      @db.Timestamptz(6)
  // Per-tenant overrides on top of the plan template (Super Admin can grant +1 branch, etc.)
  slotOverrides Json          @default("{}")        // { "maxBranches": 4 }
  gateway       String?                              // "razorpay" — reuse existing Razorpay rails
  gatewaySubId  String?
  cancelAt      DateTime?     @db.Timestamptz(6)
  createdAt     DateTime      @default(now()) @db.Timestamptz(6)

  tenant   Tenant         @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  plan     PlanDefinition @relation(fields: [planId], references: [id])
  invoices SubInvoice[]
  @@index([status, currentEnd])
  @@map("subscriptions")
}

model SubInvoice {
  id             String   @id @default(uuid()) @db.Uuid
  subscriptionId String   @db.Uuid
  amountPaise    Int
  period         BillingPeriod
  status         String   // draft|issued|paid|failed|refunded
  gatewayRef     String?
  issuedAt       DateTime @default(now()) @db.Timestamptz(6)
  paidAt         DateTime? @db.Timestamptz(6)
  subscription   Subscription @relation(fields: [subscriptionId], references: [id], onDelete: Cascade)
  @@index([subscriptionId])
  @@map("sub_invoices")
}

// Cheap, queryable usage meters so slot checks don't scan huge tables on the hot path.
// Updated incrementally by the same writes that create orders/customers/staff/outlets.
model UsageCounter {
  tenantId  String   @db.Uuid
  metric    String                            // branches|staff|customers|orders_month|storage_mb|qr_month
  period    String   @default("all")          // "all" or "2026-06" for monthly metrics
  value     Int      @default(0)
  updatedAt DateTime @default(now()) @db.Timestamptz(6)
  tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  @@id([tenantId, metric, period])
  @@map("usage_counters")
}

// Per-tenant branding for white-label (Enterprise). Falls back to Chaya One defaults.
model TenantBranding {
  tenantId    String  @id @db.Uuid
  customDomain String? @unique                // brewlab.com → CNAME to platform
  logoUrl     String?
  faviconUrl  String?
  colors      Json    @default("{}")          // { "primary": "#…", "accent": "#…" }
  appName     String?                          // overrides "Chaya One" in the PWA chrome
  poweredBy   Boolean @default(true)           // false = fully white-labelled
  tenant      Tenant  @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  @@map("tenant_branding")
}

model SupportTicket {
  id          String       @id @default(uuid()) @db.Uuid
  tenantId    String?      @db.Uuid            // null = platform-level
  subject     String
  body        String
  priority    String       @default("normal")  // low|normal|high|urgent
  status      TicketStatus @default(open)
  assignedTo  String?      @db.Uuid
  createdBy   String?      @db.Uuid            // StaffUser id
  createdAt   DateTime     @default(now()) @db.Timestamptz(6)
  tenant      Tenant?         @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  admin       PlatformAdmin?  @relation("AssignedAdmin", fields: [assignedTo], references: [id])
  messages    TicketMessage[]
  @@index([status, priority])
  @@map("support_tickets")
}

model TicketMessage {
  id        String   @id @default(uuid()) @db.Uuid
  ticketId  String   @db.Uuid
  authorKind String                            // platform|tenant
  authorId  String?  @db.Uuid
  body      String
  createdAt DateTime @default(now()) @db.Timestamptz(6)
  ticket    SupportTicket @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  @@map("ticket_messages")
}

model Announcement {
  id         String   @id @default(uuid()) @db.Uuid
  title      String
  body       String
  audience   String   @default("all")          // all|plan:pro|tenant:<id>
  publishedAt DateTime? @db.Timestamptz(6)
  createdAt  DateTime @default(now()) @db.Timestamptz(6)
  @@map("announcements")
}

// Platform-level audit (distinct from per-outlet AuditLog already in the schema).
model PlatformAudit {
  id        String   @id @default(uuid()) @db.Uuid
  adminId   String?  @db.Uuid
  action    String                            // tenant.suspend, plan.change, slot.grant…
  targetTenantId String? @db.Uuid
  meta      Json?
  ip        String?
  createdAt DateTime @default(now()) @db.Timestamptz(6)
  admin     PlatformAdmin? @relation(fields: [adminId], references: [id])
  @@index([targetTenantId, createdAt])
  @@map("platform_audit")
}
```

Add the matching back-relations on `Tenant` (`subscription Subscription?`, `branding
TenantBranding?`, `usage UsageCounter[]`, `tickets SupportTicket[]`). `Tenant.plan` and
`Tenant.status` **stay** (read-through cache of the subscription) so no existing query breaks.

### ER (control-plane additions)

```
PlatformAdmin 1───* PlatformAudit          PlanDefinition 1───* Subscription *───1 Tenant
PlatformAdmin 1───* SupportTicket                                Subscription 1───* SubInvoice
Tenant 1───1 Subscription   Tenant 1───1 TenantBranding   Tenant 1───* UsageCounter
Tenant 1───* SupportTicket 1───* TicketMessage
```

---

## 4. Tenant Resolution & Subdomain System

This is the **#1 correctness fix**. Today `getActiveOutlet()` returns the first outlet in the
DB — acceptable for a single-tenant dev scaffold, fatal for a multi-tenant SaaS. Resolution
must come from **(a) the host** for public/PWA traffic and **(b) the session** for staff.

```
Request host                         Resolution
────────────────────────────────────────────────────────────────────
kaava.chayaone.com          → lookup Tenant by subdomain "kaava"
brewlab.com (custom domain) → lookup TenantBranding.customDomain
admin.chayaone.com          → CONTROL PLANE (no tenant)
app.chayaone.com            → tenant-picker / session-derived
```

**Implementation — extend the existing `middleware.ts` (do not replace its session gate):**

```ts
// middleware.ts — add subdomain resolution + admin gating, keep PROTECTED logic
const host = req.headers.get('host') ?? '';
const sub  = host.split('.')[0];

// 1. Control plane is a hard separate gate
if (sub === 'admin') return gatePlatformAdmin(req);   // 🔨 verifies PlatformAdmin JWT

// 2. Resolve tenant → forward as a request header for downstream handlers
const tenantId = await resolveTenant(host);           // 🔨 cached subdomain/domain → id
const res = NextResponse.next();
if (tenantId) res.headers.set('x-tenant-id', tenantId);
return res;
```

Add a **slug** to `Tenant` (`subdomain String @unique`) for `kaava.chayaone.com`. Resolution
is cached (LRU in-process, or Redis if/when added) — it is a per-request hot path.

**Then `getActiveOutlet()` is replaced by two honest functions:**

```ts
// lib/context.ts
export async function getTenantId(): Promise<string> {
  // staff: from session; public/PWA: from x-tenant-id header set by middleware
  const s = await getSession();
  return s?.tenantId ?? headers().get('x-tenant-id') ?? throwNoTenant();
}
export async function withTenant<T>(fn: (tx) => Promise<T>) {
  // wraps a tx that first SETs app.current_tenant so RLS engages (§10)
}
```

DNS: a **wildcard `*.chayaone.com`** record → Railway. Custom domains (Enterprise) are added
per-tenant via CNAME + on-demand TLS.

---

## 5. Subscription & Slot Management

**Plans are data, not code** (`PlanDefinition`), so Nuro7 launches/edits tiers from the admin
UI. Per-tenant grants live in `Subscription.slotOverrides`.

```
Effective limit(metric) = slotOverrides[metric] ?? plan[metric]   // null ⇒ unlimited
Usage(metric)           = UsageCounter[tenant, metric, period]
Allowed                 = limit === null || usage < limit
```

**Enforcement is a single guard** called at the few write paths that consume a slot — not
sprinkled everywhere:

| Metric | Checked in | On exceed |
|---|---|---|
| `branches` | `POST /api/admin/.../outlets` (owner creates outlet) | 402 + upsell |
| `staff` | `POST /api/staff` | 402 + upsell |
| `customers` | `POST /api/customer/register` | soft cap / 402 |
| `orders_month` | `POST /api/orders`, `/api/qr-order` | warn → block |
| `storage_mb` | `POST /api/dashboard/upload` | 402 |

```ts
// lib/limits.ts (🔨)
export async function assertSlot(tenantId: string, metric: Metric) {
  const { limit, used } = await getUsage(tenantId, metric);
  if (limit !== null && used >= limit)
    throw new SlotExceeded(metric, limit);   // → 402, structured upsell payload
}
```

Counters increment in the **same transaction** as the entity insert (no drift), with a nightly
reconciler as backstop. Subscription **status** gates access globally: `suspended`/`expired`
tenants get a read-only billing-wall screen on every surface (one middleware check), while
their data is preserved (never deleted on lapse).

**Dashboard usage meters** (Owner sees their own; Super Admin sees all):

```
Branches  ██████░░░░  2 / 3      Staff  ████████░░ 15 / 20
Customers ███░░░░░░░  430 / 2000 Storage ██░░░░░░░░ 180MB / 1GB
```

---

## 6. Super Admin Dashboard (Level 1) — design

Route group `app/admin/*` behind `admin.chayaone.com`. Visual language reuses the existing
**Luxe design system** (Cormorant display + gold accent) so it feels like one product.

**Widgets (per the brief):** Total / Active / Trial / Expired cafes · MRR · ARR · Daily
Orders · QR Orders · Customer Growth · Storage Usage · API Usage · Uptime.

```
┌─ Nuro7 Platform ──────────────────────────────── admin ▾ ─┐
│  Cafes 128   Active 104   Trial 17   Expired 7            │
│  MRR ₹3.4L  ↑12%        ARR ₹41L        Orders today 9,210│
│ ┌── Revenue (12mo) ──────────┐ ┌── Tenant growth ───────┐ │
│ │      ▁▂▃▄▅▆▇█              │ │   ▁▂▃▄▅▆▇              │ │
│ └────────────────────────────┘ └────────────────────────┘ │
│  Tenants                                    [+ New Cafe]   │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Kaava      Growth   Active   2/3 br  15/20 staff  ⋯ │  │
│  │ Tea Express Starter Trial(4d) 1/1 br  3/5 staff   ⋯ │  │
│  │ Brew Lab   Pro      Past-due  6/10 br 60/100      ⋯ │  │
│  └────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

Tenant detail → tabs: **Overview · Subscription · Slots · Feature Flags · Branding ·
Audit · Tickets**. Actions (suspend/activate/delete/impersonate-readonly) write a
`PlatformAudit` row every time.

---

## 7. Tenant Creation & Onboarding Workflow

```
Super Admin: "New Cafe"
   ├─ name, owner email/phone, subdomain (validate unique)
   ├─ choose PlanDefinition + BillingPeriod  (Free Trial = 14d trialing)
   ├─ assign slot overrides (optional)
   ▼
[transaction]  create Tenant → Subscription(trialing) → first Outlet
               → owner StaffUser (temp PIN/password) → UsageCounter rows
               → TenantBranding (defaults) → seed default menu/categories
   ▼
generate kaava.chayaone.com  → send Welcome email (magic link)
   ▼
Owner first login → Onboarding Wizard (5 steps):
   1 Cafe profile (logo, GST, address)  2 First branch
   3 Menu import/quick-add  4 Invite staff  5 Print table QRs
   ▼
Cafe goes LIVE  (status active once trial→paid or trial running)
```

All of this is **new admin code on top of existing seed logic** — the per-tenant seed already
exists for dev; we parameterise it by `tenantId`.

---

## 8. API Structure (additions only)

Existing tenant APIs are untouched. New namespaces:

```
/api/admin/auth/login            POST   PlatformAdmin login (email+password+TOTP)
/api/admin/tenants               GET    list + filters (plan/status/usage)
/api/admin/tenants               POST   create tenant (workflow §7)
/api/admin/tenants/[id]          GET PATCH DELETE
/api/admin/tenants/[id]/suspend  POST
/api/admin/tenants/[id]/activate POST
/api/admin/tenants/[id]/slots    PATCH  set slotOverrides
/api/admin/tenants/[id]/flags    PATCH  feature flags
/api/admin/tenants/[id]/branding PUT    white-label
/api/admin/plans                 GET POST PATCH   PlanDefinition CRUD
/api/admin/analytics/platform    GET    MRR/ARR/growth/usage
/api/admin/announcements         GET POST
/api/admin/tickets               GET PATCH
/api/admin/audit                 GET

/api/billing/subscription        GET            owner: own plan + usage
/api/billing/checkout            POST           owner: upgrade (Razorpay)
/api/billing/webhook             POST           Razorpay → update SubStatus/SubInvoice
```

Every `/api/admin/*` handler asserts a valid `PlatformAdmin` session **and** writes
`PlatformAudit`. Every tenant write that consumes a slot calls `assertSlot()` (§5).

---

## 9. Folder Structure (delta)

```
platform/apps/web/
  middleware.ts                 ✏️ + subdomain resolve + admin gate
  lib/
    auth.ts                     ✏️ existing staff session (unchanged)
    platform-auth.ts            🔨 PlatformAdmin JWT (separate cookie/secret)
    platform-rbac.ts            🔨 Level-1 permission map
    tenant.ts                   🔨 resolveTenant(host) + cache
    limits.ts                   🔨 assertSlot / getUsage / SlotExceeded
    context.ts                  ✏️ getTenantId() / withTenant() replace getActiveOutlet()
  app/
    admin/                      🔨 Super Admin surface (route group)
      login/  page.tsx
      page.tsx                  dashboard
      tenants/[id]/page.tsx
      plans/  analytics/  tickets/  announcements/
    (tenant surfaces unchanged: dashboard, pos, kds, approvals, app)
    api/admin/**                🔨
    api/billing/**              🔨
platform/packages/db/prisma/
  schema.prisma                 ✏️ + §3 models + Tenant.subdomain
  migrations/0005_control_plane/ 🔨
  rls.sql                       ✏️ complete coverage (all tenant tables) + denormalised tenant_id
```

---

## 10. Security Architecture

| Control | Status | Plan |
|---|---|---|
| **Tenant isolation (RLS)** | ✅ scaffold | Extend `rls.sql` to *all* tenant tables; denormalise `tenant_id` onto hot outlet-scoped tables (orders/order_items/payments) to avoid join-in-policy; app connects as **non-BYPASSRLS** role, migrator as BYPASSRLS. Wrap every tenant request in `SET app.current_tenant`. |
| **Two principal types** | 🔨 | `StaffUser` (PIN, 12h) for tenants; `PlatformAdmin` (password+TOTP) for Nuro7 — **separate JWT secret + cookie**, so a tenant token can never reach `/api/admin`. |
| **JWT auth** | ✅ | `jose` HS256 httpOnly; keep. Add rotation + `lastLoginAt`/session table for revocation. |
| **2FA** | 🔨 | TOTP for all `PlatformAdmin`; optional for tenant `owner`. (`totpSecret` field added.) |
| **Rate limiting** | 🔨 (noted TODO in `login/route.ts`) | Per-IP + per-account on `/api/*/login`, `/api/qr-order`, billing webhook. In-memory now, Redis at scale. |
| **Audit** | ✅ tenant / 🔨 platform | Per-outlet `AuditLog` exists; add `PlatformAudit` for control-plane actions. |
| **Password storage** | ✅ pin sha256 / 🔨 | Move `PlatformAdmin` to argon2/bcrypt (PIN sha256 is fine for fast POS, **not** for platform admins). |
| **Webhook security** | 🔨 | Verify Razorpay signature on `/api/billing/webhook`; idempotent on `gatewayRef`. |

**RLS is the load-bearing boundary** — application checks are defence-in-depth, not the
primary control. This is the difference between "multi-tenant data model" (have it) and
"multi-tenant *secure*" (the gap to close).

---

## 11. Deployment Architecture

Keep the **Docker-on-Railway** pipeline (`Dockerfile`, `railway.toml`, debian Prisma engine —
all already fixed in recent commits). Additions:

```
DNS:   *.chayaone.com  →  CNAME  →  Railway web service   (wildcard, one cert)
       admin.chayaone.com is just another subdomain (gated in middleware)
       Enterprise custom domains: per-tenant CNAME + Railway on-demand TLS

Env:   DATABASE_URL (app role, non-BYPASSRLS)   DIRECT_URL (migrator, BYPASSRLS)
       JWT_SECRET (staff)   PLATFORM_JWT_SECRET (admin)   RAZORPAY_*   TENANT_BASE_DOMAIN

Migrate: prisma migrate deploy  →  then psql -f rls.sql   (release step)
```

**Redis** is optional and earns its place only for: leaderboards (Phase 2 already wants it),
distributed rate-limit, and tenant-resolution cache at high traffic. **Kubernetes** is a
future-scale lever (multi-region, per-tenant DB sharding) — not needed to serve thousands of
cafes from Railway + a managed Postgres.

**Scaling path:** vertical Postgres → read replicas → **partition hot tables by tenant** →
"noisy-neighbour" tenants promoted to a dedicated DB (the `Subscription` row already tells you
which) → multi-region. Shared-DB-with-RLS comfortably covers the first several thousand cafes.

---

## 12. UX / Wireframe Notes

- **One design language** across planes (Luxe: Cormorant + gold). Super Admin uses a denser,
  data-grid layout; tenant surfaces unchanged.
- **Slot meters** (§5) appear on the Owner dashboard header and the Super Admin tenant row —
  same component, two contexts.
- **Billing wall**: suspended/expired tenants see a full-screen, branded "Renew to continue"
  with their data visibly intact behind it (trust > pressure).
- **Onboarding wizard**: 5 steps, progress dots, skippable, resumable.
- **Impersonate (read-only)**: Super Admin can view a tenant's dashboard with a persistent red
  "Viewing as Kaava — read only" banner; writes blocked; every entry audited.

---

## 13. White-Label (Enterprise)

`TenantBranding` drives it. The PWA already reads theme from `Outlet.settings`; we add a
tenant-level resolve that overrides logo/colors/appName and, when `poweredBy = false`, hides
the "Powered by Chaya One" mark. Custom domain (`brewlab.com`) resolves the same tenant as the
subdomain would. Gated by the `white_label` feature flag (Enterprise plan only).

---

## 14. Notification & Support Center

- **Tenant-facing notifications** already exist (`Notification` model, low-stock etc.) — reuse.
- **Platform → tenant**: `Announcement` (broadcast or targeted by plan/tenant), surfaced in the
  Owner dashboard bell.
- **Support**: `SupportTicket` + `TicketMessage`; tenant raises from dashboard, Nuro7 triages in
  `/admin/tickets`. Channels (Email/WhatsApp/SMS/Push) ride existing `Campaign`/`Channel`
  infra where possible.

---

## 15. Phased Build Roadmap (fits the existing 01–09 plan)

This slots in as **Phase G — Control Plane**, after the feature phases A–F already shipped/planned.
Each step is independently shippable and reversible.

| Step | Deliverable | Risk | Depends on |
|---|---|---|---|
| **G1** | Schema migration `0005_control_plane` + `Tenant.subdomain` + seed PlanDefinitions | low (additive) | — |
| **G2** | Tenant resolution: middleware subdomain + `getTenantId()`/`withTenant()`, retire `getActiveOutlet()` stub | **high value** — closes isolation gap | G1 |
| **G3** | Complete RLS coverage + non-BYPASSRLS app role | high value | G2 |
| **G4** | `PlatformAdmin` auth (password+TOTP, separate cookie) + `/admin` shell + dashboard widgets | med | G1 |
| **G5** | Tenant lifecycle (create/suspend/activate/delete) + onboarding wizard | med | G4 |
| **G6** | Subscription + slot model + `assertSlot()` gates + usage meters | med | G1, G2 |
| **G7** | Billing (Razorpay subscription + webhook) + billing wall | med | G6 |
| **G8** | Platform analytics (MRR/ARR/growth), audit, tickets, announcements | low | G4 |
| **G9** | White-label + custom domains + feature-flag gating | low | G4 |

**Recommended first slice (highest value, lowest risk): G1 → G2 → G3.** That turns the current
"multi-tenant in shape, single-tenant in runtime" app into a genuinely isolated platform —
which is the foundation everything else (billing, admin, slots) safely sits on. The Super Admin
UI (G4–G5) is the most *visible* milestone and a good second slice.

---

## Appendix — what we explicitly are NOT doing (and why)

- **Not** porting to Express/Vite/Socket.IO/Redis/K8s — would destroy working features and
  violate the brief's own non-negotiables. Next.js + Prisma + SSE + Railway already meet the
  scale target.
- **Not** re-modelling tenancy — `Tenant`/`Outlet`/`tenantId` already exist; we extend.
- **Not** deleting suspended tenants' data — retain; gate access via subscription status.
- **Not** a new identity table for owners/staff — Levels 2–4 already exist in `StaffUser`/`rbac.ts`.
```
