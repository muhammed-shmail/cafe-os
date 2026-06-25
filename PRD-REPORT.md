# Cafe OS / ChayaOne — Product Requirements Document (PRD) Report

**Product:** Cafe OS — *The Growth Operating System for Cafes* (operated as the **Nuro7 / ChayaOne** SaaS platform)
**Report date:** 2026-06-23
**Status:** Alpha — core platform feature-complete through Phase G; pre go‑live hardening in progress
**Scope of this report:** Restates the product requirements and reports each one's **as‑built implementation status** against the live codebase (`platform/`, Next.js + Prisma + PostgreSQL).

**Status legend:** ✅ Done & in code · 🟡 Partial / config exists · ⬜ Planned / not started

---

## 1. Executive Summary

Cafe OS is a multi-tenant SaaS that goes beyond a point-of-sale system: it is a **retention engine** that turns a customer's 8–12 minute wait into a gamified, points-earning, loyalty-building experience, while giving owners a full POS + inventory + staff + analytics + AI stack underneath.

As of this report, the product spans **five surfaces** (Tablet POS, Kitchen Display, Customer PWA, Owner Dashboard, and a Nuro7 super‑admin control plane) on a single Next.js 14 + Prisma + PostgreSQL codebase. The original MVP loop (**wait → play → earn → upsell → return**) is implemented end‑to‑end, and six enterprise enhancement phases (A–F) plus a full SaaS control plane (Phase G) have been built.

**Headline status:**
- **POS, KDS, Table QR ordering + waiter approval, Customer PWA, Loyalty + Games** — ✅ shipped.
- **Inventory (recipe auto-deduct, suppliers/credit), Table analytics, Owner monitoring/alerts, RBAC + attendance** — ✅ shipped (Phases A–F).
- **CRM / Customer Management, GST engine, Revenue analytics, AI Sales Assistant (Gemini)** — ✅ shipped.
- **SaaS control plane** (super-admin, subscriptions, slots/limits, tenant lifecycle, white-label, tickets, platform analytics) — ✅ code-complete (Phase G), **not yet live-verified on production DB**.
- **Deferred:** split payment, native thermal/ESC‑POS printing, true offline outbox, Razorpay checkout, AI Inventory/Marketing assistants, badges/leaderboards, multiplayer game rooms.

---

## 2. Vision & Mission

> **Cafe OS is India's first Growth Operating System for cafes** — a system that does not just *record* a transaction but *grows* the relationship after it. The receipt is not the last touchpoint; it is the first touchpoint of a loyalty loop.

**Mission:** Help 100,000 small F&B businesses in India grow revenue 20%+ through engagement, not discounting.

**Core insight:** The 8–12 minute wait is dead time today. It is the highest‑attention, lowest‑cost window to drive retention behavior — and nobody is using it.

**The loop (implemented):**
```
Order placed ──► QR scanned ──► Wait-time entertainment ──► Points earned
     ▲                                                          │
     │                                                          ▼
  Return visit ◄── nudge ◄── Reward unlocked ◄── Game played
```

---

## 3. Problem

| Stakeholder | Pain today | How Cafe OS addresses it |
|---|---|---|
| Cafe owner | POS only bills. No idea who customers are or why they don't return. Discount wars erode margin. | Owns the customer relationship (CRM + loyalty + PWA), margin via inventory/waste, AI co‑pilot. |
| Customer | Waiting is boring. Loyalty = a paper card they lose. | Order-tracking entertainment, games, digital points wallet & tiers. |
| Staff | Manual KOT, kitchen miscommunication, no shift visibility. | Realtime KOT→KDS, RBAC, attendance punch. |
| Kitchen | Handwritten/verbal tickets, no prioritization. | Live KDS queue (SSE), per-ticket state. |
| Multi-outlet brand / platform operator | No central control, billing, or tenant isolation. | Nuro7 control plane: super-admin, subscriptions, slots, white-label. |

---

## 4. Personas

1. **Ravi — Independent Cafe Owner (primary buyer).** 1–3 outlets, WhatsApp-native, price-sensitive; wants repeat customers without hiring a marketer.
2. **Priya — Cashier / Counter Staff.** Speed and simplicity; onboarding must be <15 min.
3. **Arjun — The Customer.** 18–35, smartphone-first, loves rewards & games; scans a QR if there's a payoff.
4. **Kitchen Lead.** Wants a clear, prioritized queue.
5. **Multi-outlet Brand Manager.** Consolidated analytics, central controls.
6. **Nuro7 Platform Operator (new).** Super-admin who provisions tenants, sets plans/slots, handles billing & support.

---

## 5. Architecture Overview (as built)

| Layer | Technology | Notes |
|---|---|---|
| Framework | **Next.js 14.2** (App Router, React 18, TypeScript) | Webpack (Turbopack intentionally dropped for stability) |
| Data | **Prisma ORM + PostgreSQL** | Neon (prod) / embedded Postgres on `:5433` (dev) |
| Monorepo | Turborepo: `apps/web` + `packages/{core,db,ui}` | `@cafeos/core` (billing/GST/units), `@cafeos/db` (Prisma), `@cafeos/ui` (tokens) |
| Realtime | **Server-Sent Events (SSE)** | KDS, POS, customer, approvals, notifications streams |
| Auth | **jose JWT** — staff PIN session, customer session, separate platform-admin session | Per-tenant scoped PIN login |
| Styling | Tailwind + design tokens, **Framer Motion**, "Luxe" design language (Cormorant + gold) | |
| AI | **Google Gemini 1.5 Flash** (Sales Assistant) | Feature-gated, EN + Malayalam |
| Payments | Cash / Card / UPI captured; **Razorpay deferred** | |
| Deploy | **Railway** (`Dockerfile.railway`, `railway.toml`) | |
| Multi-tenancy | `Tenant` → `Outlet`, `tenantId`/`outletId` scoping, subdomain resolution, **Postgres RLS** (`rls.sql`) | Data model multi-tenant from the start |

**The five surfaces:**
1. **Tablet POS** — `/pos` (billing, KOT, payments)
2. **Kitchen Display (KDS)** — `/kds` (live queue)
3. **Customer PWA** — `/app` (+ `/t` table QR, `/approvals` waiter)
4. **Owner Dashboard** — `/dashboard` (11 modules)
5. **Nuro7 Super-Admin Control Plane** — `/admin` (separate principal & session)

**Scale of the codebase:** ~52 API route handlers · ~60 Prisma models + ~25 enums · 5 SQL migrations (`0001`→`0005`).

---

## 6. Functional Requirements — Status Matrix

### 6.1 POS System
| Requirement | Status | Notes |
|---|:--:|---|
| Menu: categories, modifiers, variants, combos | ✅ | `Category`, `MenuItem`, `ModifierGroup`, `Modifier`, `Combo` models + dashboard menu editor |
| Order types: dine-in (table), takeaway | ✅ | `OrderType` enum; delivery later |
| GST billing (configurable per outlet) | ✅ | Per-outlet `Outlet.settings.gst` (on/off, flat rate, inclusive/exclusive); item-level HSN/rate; `computeBill` in `@cafeos/core` |
| Item-level / bill-level discounts | ✅ | Discount handling in billing + large-discount alerting |
| Payments: Cash, Card, UPI (capture) | ✅ | `Payment` / `PayMethod` |
| UPI dynamic QR via Razorpay | ⬜ | Razorpay deferred (only used in billing wall stub) |
| Split payment (by amount/item) | ⬜ | Not yet implemented |
| Refunds (full/partial, reason, approval) | 🟡 | `Refund` model + wallet/loyalty reversal on cancel; no dedicated partial-refund UI |
| Receipt — digital / browser print | ✅ | Receipt render + browser print in `PosClient` |
| Receipt — native thermal ESC/POS (58/80mm) | ⬜ | Not integrated |
| KOT routing → station + KDS | ✅ | `Kot`/`Station`; realtime to KDS |
| Table management (floor map, states) | ✅ | `TableMap`/`TableState`; floor editor (Settings → Floor) |
| Offline mode (outbox + sync) | ⬜ | Online-status awareness only; no offline order queue |

### 6.2 Inventory Management
| Requirement | Status | Notes |
|---|:--:|---|
| Stock items + recipe/BOM mapping | ✅ | `StockItem`, `Recipe` (with `unit`) |
| Auto-deduct ingredients on order | ✅ | **Phase A** — `applyRecipeConsumption` wired into `POST /api/orders` |
| Low-stock & expiry alerts | ✅ | **Phase A** — `emitLowStockAlerts` → `Notification` feed + dashboard banner |
| Waste tracking with reasons | 🟡 | `WasteLog` model present; UI surfacing partial |
| Purchase Orders → vendor → receipt | ✅ | **Phase B** — `PurchaseOrder`/`PurchaseOrderItem`/`PoStatus` |
| Vendor management | ✅ | **Phase B** — `Vendor` (phone/email/gstin/opening balance) |
| Supplier credit ledger / dues | ✅ | **Phase B** — `SupplierPayment`; running-balance statement via `/api/suppliers` |
| Stock counts / audits / variance | 🟡 | `StockLedger` present; dedicated count workflow partial |

### 6.3 Staff Management
| Requirement | Status | Notes |
|---|:--:|---|
| Roles & RBAC (Owner/Manager/Cashier/Kitchen/Waiter) | ✅ | **Phase F** — `lib/rbac.ts`, surface gating, `/api/staff` user management |
| PIN login | ✅ | Per-tenant scoped, sha256 |
| Attendance clock-in/out | ✅ | **Phase F** — `/api/attendance` (self-punch + manager override), `Attendance` model |
| Shift scheduling / rota / labor-cost | 🟡 | `Shift` + `SalaryPayment` models (migration `0004_phase_f_staff_hr`); scheduling UI partial |
| Per-staff sales & void/discount audit | ✅ | `AuditLog` across writers; audit panel in Settings |

### 6.4 Analytics Dashboard
| Requirement | Status | Notes |
|---|:--:|---|
| Sales daily / weekly / monthly | ✅ | `RevenuePanel` + `/api/dashboard/revenue` (TZ-correct, gap-filled), CountUp KPIs |
| Hour-of-day / day-part heatmap | ✅ | **Phase D** — peak hours + DOW×hour revenue heatmap |
| Table occupancy & profitability | ✅ | **Phase D** — live floor, 30-day profitability, revenue/occupied-hr |
| Best-sellers / slow-movers | 🟡 | `ItemSalesRollup` + analytics; menu-engineering quadrant logic present, surfacing partial |
| Profit reports (revenue − COGS − labor) | 🟡 | COGS derivable from recipes; full P&L view partial |
| Customer cohort / RFM / retention | 🟡 | CRM analytics (`lib/crm.ts`) provides segments & timeline; full cohort charts partial |
| Owner monitoring + alert engine | ✅ | **Phase E** — `getMonitor` (8 live metrics), `lib/alerts.ts`, 🔔 bell feed via SSE `notify` |
| GST report | ✅ | Reports → GST Report (tax collected, taxable/non-taxable, by-rate) |

### 6.5 Customer QR Experience (PWA)
| Requirement | Status | Notes |
|---|:--:|---|
| Table QR → instant PWA (no install) | ✅ | `/t` table route → `/app` PWA |
| Live order status + kitchen progress | ✅ | SSE customer stream |
| Order-tracking entertainment | ✅ | Home sections, banners, featured (owner-configurable) |
| In-PWA ordering + waiter approval | ✅ | **Phase C** — `POST /api/qr-order` (pending) → `/api/approvals` (approve cuts KOT + deducts stock) |
| In-app upsell / reorder | 🟡 | Featured items + cart; structured upsell prompts partial |
| Loyalty wallet + tiers + offers | ✅ | Points wallet, computed tiers (vip→"Platinum"), redemption |
| Owner-configurable PWA | ✅ | Settings → PWA panel (registration, home, banners, games, rewards, theme) — all in `Outlet.settings.pwa`, zero migration |

### 6.6 Customer Auth & Loyalty
| Requirement | Status | Notes |
|---|:--:|---|
| Phone OTP login | ✅ | Signed JWT session (jose, 90d); stateless OTP challenge; dev echo |
| 3-step onboarding (phone→code→name) | ✅ | Returning device auto-login |
| Points earn on spend (configurable rate) | ✅ | `LoyaltyLedger`; `earnRatePaisePerPoint` + first-order bonus |
| Tiers / rewards catalog / coupons | ✅ | `RewardCatalog`, `Coupon`, computed tiers |
| Wallet redemption at checkout | ✅ | Provisional hold → `discountPct`; reversed on cancel/reject |
| Birthday / anniversary automation | 🟡 | Config (`firstOrderBonus`/`birthdayBonus`/`referralBonus`) exists; scheduled send pending |
| Referral system | 🟡 | `Referral` model present; viral-loop UX pending |

### 6.7 Gamification & Social
| Requirement | Status | Notes |
|---|:--:|---|
| Spin the Wheel (server-authoritative) | ✅ | `/api/customer/spin`, per-visit cap |
| Quick Cafe Games hub (6 games) | ✅ | Mini Imposter (deep) + emoji/word/quiz/spot/memory; single-device |
| Server-authoritative rewards + anti-farming | ✅ | `/api/customer/games/complete`, one payout/game/visit |
| 500+ ML / 500+ EN word bank | 🟡 | ~110 seeded in `lib/games/words.ts`; bulk data entry pending |
| Badges & leaderboards | ⬜ | `Badge`/`CustomerBadge`/`Leaderboard` models exist; award + screen pending |
| Multiplayer rooms | ⬜ | `GameRoom`/`GameRoomPlayer` reserved for future multi-device mode |

### 6.8 CRM (Customer Management)
| Requirement | Status | Notes |
|---|:--:|---|
| Admin customer dashboard | ✅ | `CustomerManagement.tsx` + `/api/dashboard/customers` (list, analytics, profile, timeline) |
| Wallet / points admin ops | ✅ | Wallet = points-equivalent; every edit writes `LoyaltyLedger` + `AuditLog` |
| Customer segments / status / source | ✅ | `CustomerStatus`, `CustomerSource` (pwa/manual/import), import path |
| Loyalty settings | ✅ | Reuses `/api/dashboard/pwa` (`points_save`/`wallet_save`/`loyalty_save`) |

### 6.9 AI Assistants
| Requirement | Status | Notes |
|---|:--:|---|
| AI Sales Assistant ("why are sales down?") | ✅ | `/api/dashboard/assistant` — Gemini 1.5 Flash, grounded in live analytics, EN + Malayalam, feature-gated |
| AI Inventory Assistant (forecast/reorder) | ⬜ | Planned |
| AI Marketing Assistant (segments/campaigns) | ⬜ | Planned (`Segment`/`Campaign`/`CampaignSend` models exist) |

---

## 7. SaaS Control Plane (Phase G — Nuro7 / ChayaOne)

Transforms Cafe OS into a Nuro7-operated multi-tenant SaaS. Built additively on top of the already multi-tenant data model. **Code-complete; not yet live-verified on a production DB.**

| Capability | Status | Notes |
|---|:--:|---|
| Super-admin auth (password + TOTP, separate JWT) | ✅ | `lib/platform-auth.ts`, `lib/platform-crypto.ts` (zero-dep scrypt + RFC-6238 TOTP); separate `chayaone_admin` cookie. Bootstrap: `admin@nuro7.com` / `admin1234` |
| Tenant resolution (subdomain / custom domain) | ✅ | `lib/tenant.ts`; `DEV_TENANT_SUBDOMAIN` for local; fixes the old "first outlet" bug |
| Row-Level Security across ~45 tables | ✅ | Rewritten `rls.sql` (camelCase columns, `app_current_tenant()` helpers, ENABLE-not-FORCE) |
| Tenant lifecycle (create/suspend/activate/onboard) | ✅ | `lib/platform-tenants.ts` + `/api/admin/tenants/*` |
| Subscriptions + plans | ✅ | `Subscription`, `PlanDefinition`, `SubInvoice`; billing wall (`lib/billing.ts`, manual) |
| Usage slots / limits | ✅ | `lib/limits.ts` — `assertSlot`/`bumpUsage` at staff/customer/order write paths; `UsageCounter` |
| Platform analytics / audit | ✅ | `/api/admin/analytics/platform`, `PlatformAudit`, `/admin/ops` |
| Support tickets + announcements | ✅ | `SupportTicket`/`TicketMessage`/`Announcement` + `/api/admin/tickets`, `/api/support` |
| White-label / branding + feature flags | ✅ | `lib/branding.ts` (`TenantBranding`), `lib/features.ts` (gates AI assistant) |
| Razorpay checkout | ⬜ | Deferred; billing currently manual |
| `withTenant()` adoption across all routes | 🟡 | Helper exists; not yet adopted everywhere |

**Go-live checklist (remaining):** apply migration + `psql -f rls.sql` on Neon · seed super-admin & plans · add non-`BYPASSRLS` app DB role · wildcard `*.chayaone.com` DNS · PWA to consume `getTenantBranding` · storage metering.

---

## 8. Non-Functional Requirements

| NFR | Target | Status | Notes |
|---|---|:--:|---|
| POS action latency | <100 ms local | 🟡 | Server round-trip; no local-first cache yet |
| PWA first paint | <1.5 s on 4G | 🟡 | Next.js SSR + PWA; not formally measured |
| Availability | POS offline-tolerant; 99.9% cloud | 🟡 | Cloud on Railway; **offline mode not implemented** |
| Security — RBAC | Granular per-surface | ✅ | `lib/rbac.ts` |
| Security — tenant isolation | Hard isolation | ✅ | tenantId scoping + RLS (pending live apply) |
| Security — PCI | No card storage | ✅ | No card data stored (Razorpay tokenization when enabled) |
| Money precision | Paise as integers | ✅ | Paise-precision throughout |
| Localization | English + (Hindi/regional) | 🟡 | EN throughout; **Malayalam** in AI + games; full i18n pending |
| Accessibility | WCAG AA on PWA | 🟡 | Large-tap POS targets; formal audit pending |
| Scale | 10k outlets / 50k concurrent PWA | ⬜ | Architecture supports; not load-tested |

---

## 9. Success Metrics (per outlet, 90 days post-install)

These remain the product's north-star targets; instrumentation exists in analytics/monitor but outcome validation requires live design-partner data.

| Metric | Target | Instrumentation status |
|---|---|:--:|
| QR scan rate (of dine-in orders) | ≥ 35% | 🟡 (channel tracked via `OrderChannel`) |
| Repeat-visit rate | +15% vs baseline | 🟡 (CRM/RFM) |
| AOV | +8% (upsell + game add-ons) | 🟡 (revenue analytics / AOV KPI) |
| Waste | −20% | 🟡 (WasteLog + inventory) |
| Loyalty enrollment | ≥ 25% of active customers | ✅ (customer source + loyalty ledger) |

---

## 10. Roadmap & Delivery Status

### Original MVP plan (docs 09) vs delivery
| Phase | Theme | Status |
|---|---|:--:|
| P1 | Credible POS + engagement spark (POS, KDS, Table QR, PWA core, loyalty, Spin Wheel, basic inventory, RBAC) | ✅ Delivered |
| P2 | Engagement engine (more games, BOM auto-deduct, waste, PO/vendors, shift scheduling, WhatsApp, profit/cohorts) | 🟡 Mostly delivered (badges/leaderboards, multiplayer, WhatsApp pending) |
| P3 | AI & scale (AI assistants, membership/wallet, multi-outlet, white-label) | 🟡 Sales AI + white-label + multi-tenant done; Inventory/Marketing AI, membership pending |
| P4 | Network & platform (cross-cafe network, franchise, marketplace, public API) | ⬜ Future |

### Enterprise enhancement phases (executed)
| Phase | Scope | Status |
|---|---|:--:|
| A | Recipe auto-deduction + low-stock alerts | ✅ |
| B | Supplier credit ledger | ✅ |
| C | QR ordering + waiter approval | ✅ |
| D | Table occupancy / revenue analytics | ✅ |
| E | Owner monitoring dashboard + alert engine | ✅ |
| F | Staff accountability (RBAC + users + attendance) | ✅ (shift scheduling/cash-handling 🟡) |
| G | SaaS control plane (super-admin, subscriptions, slots, white-label) | ✅ code-complete, ⬜ live-verify |

---

## 11. Goals & Non-Goals

**Goals:** best-in-class fast POS · a PWA that makes waiting fun and drives repeat visits · gamified loyalty with real anti-abuse · AI assistants that turn data into plain-language actions · operable multi-tenant SaaS.

**Non-Goals (v1):** full accounting/GST filing (we export, we don't file) · third-party aggregator (Swiggy/Zomato) management · hardware manufacturing.

---

## 12. Key Differentiators

1. **Wait-time monetization** — turns the queue into revenue (unique).
2. **Gamified loyalty** inside the cafe.
3. **AI assistant in plain language** ("Why are sales down?") — live, grounded in the outlet's own data.
4. **Owns the post-purchase relationship** (CRM + loyalty + PWA).
5. **Margin via waste/inventory**, not just top-line.
6. **Operator-grade SaaS control plane** — multi-tenant, white-label, metered.

---

## 13. Open Items, Gaps & Risks

**Functional gaps (prioritized):**
1. **Payments depth** — split payment, partial refund UI, Razorpay UPI QR. *(High owner value for POS credibility.)*
2. **Offline-tolerant POS** — outbox + sync; currently online-only. *(Core NFR; reliability risk in low-connectivity venues.)*
3. **Native thermal printing (ESC/POS)** — currently browser print only.
4. **Phase G live-verification** — apply RLS on Neon, non-BYPASSRLS DB role, wildcard DNS before onboarding real tenants. *(Security/isolation risk if skipped.)*
5. **Engagement depth** — badges/leaderboards, multiplayer rooms, 500+ word bank, referral viral loop.
6. **AI breadth** — Inventory & Marketing assistants.
7. **Outcome instrumentation** — close the loop on the six growth-lever metrics with live dashboards.

**Operational/tech risks:**
- Windows dev: Prisma client regen locks against a running `next dev` — stop dev before `prisma generate`/`db push`.
- Turbopack instability led to dropping `--turbo`; keep on webpack.
- App Router root layout must not contain a manual `<head>` (suppresses global CSS injection).

---

## 14. Appendix — Technical Inventory

**Surfaces / routes:** `/pos`, `/kds`, `/app`, `/t` (table QR), `/approvals`, `/dashboard`, `/admin` (+ `/admin/login`, `/admin/ops`, `/admin/tenants`).

**Dashboard modules (11):** dashboard (revenue), orders, menu, inventory, suppliers, tables, customers (CRM), staff, monitor, reports, settings.
**Settings panels (7):** general, tax & GST, PWA, floor, devices, multibranch, audit.

**Data model (~60 models):** core POS (`Tenant`, `Outlet`, `MenuItem`, `Order`, `Kot`, `Payment`, `Refund`, `TableMap`), inventory (`StockItem`, `Recipe`, `StockLedger`, `WasteLog`, `Vendor`, `PurchaseOrder`, `SupplierPayment`), staff/HR (`StaffUser`, `Role`, `Attendance`, `Shift`, `SalaryPayment`, `AuditLog`), CRM/loyalty (`Customer`, `LoyaltyLedger`, `RewardCatalog`, `Coupon`, `Segment`, `Campaign`), gamification (`Game`, `GameSession`, `GameRoom`, `Badge`, `Leaderboard`, `Streak`, `Referral`), analytics rollups (`DailySalesRollup`, `ItemSalesRollup`), and the control plane (`PlatformAdmin`, `PlanDefinition`, `Subscription`, `SubInvoice`, `UsageCounter`, `TenantBranding`, `SupportTicket`, `Announcement`, `PlatformAudit`).

**Migrations:** `0001_phase_a_recipe_inventory` · `0002_phase_b_supplier_credit` · `0003_phase_c_qr_approval` · `0004_phase_f_staff_hr` · `0005_control_plane`.

**Related design docs:** `01-PRD.md`, `02-TECH-ARCHITECTURE.md`, `03-DATABASE-SCHEMA.md`, `04-API-STRUCTURE.md`, `05-GAMIFICATION-AND-SOCIAL.md`, `06-RETENTION-AND-AI.md`, `07-UX-FLOWS.md`, `08-BUSINESS.md`, `09-ROADMAP-MVP.md`, `10-QUICK-CAFE-GAMES.md`, `10-SAAS-CONTROL-PLANE.md`, `ChayaOne_Architecture.md`, `DEPLOYMENT.md`.

---

*This report reflects the codebase under `platform/` as of 2026-06-23. Statuses are derived from the live source (routes, Prisma schema, migrations) cross-checked against the project roadmap. Items marked "code-complete / not live-verified" require a production-DB validation pass before relying on them in front of real tenants.*
