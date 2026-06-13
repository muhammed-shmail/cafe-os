
# 01 — Product Requirements Document (PRD)

## 1. Vision

> **Cafe OS is India's first Growth Operating System for cafes** — a system that does not just *record* a transaction but *grows* the relationship after it. We make the customer's waiting time the most valuable engagement channel a cafe owns, and we hand the owner an AI co-pilot that increases revenue, retention, and margin.

**Mission:** Help 100,000 small F&B businesses in India grow revenue 20%+ through engagement, not discounting.

## 2. Problem

| Stakeholder | Pain today |
|-------------|-----------|
| Cafe owner | POS only bills. No idea who customers are, why they don't return, or what to promote. Discount wars erode margin. |
| Customer | Waiting is boring & frustrating. No reason to come back beyond the coffee. Loyalty = a paper stamp card they lose. |
| Staff | Manual KOT, miscommunication with kitchen, no shift visibility. |
| Kitchen | Handwritten/verbal tickets, no prioritization, no timers. |

**Core insight:** The 8–12 minute wait is dead time today. It's the highest-attention, lowest-cost window to drive retention behavior. Nobody is using it.

## 3. Target Users / Personas

1. **Ravi — Independent Cafe Owner (primary buyer).** 1–3 outlets, 28–45, WhatsApp-native, price-sensitive, wants more repeat customers without hiring a marketer.
2. **Priya — Cashier/Counter Staff.** Speed and simplicity matter; touchscreen tablet; high turnover so onboarding must be <15 min.
3. **Arjun — The Customer.** 18–35, smartphone-first, loves rewards & games, will scan a QR if there's a payoff.
4. **Kitchen lead.** Wants a clear, prioritized queue and timers.
5. **Multi-outlet Brand Manager (Enterprise).** Wants consolidated analytics, central menu, franchise controls.

## 4. Goals & Non-Goals

**Goals**
- Best-in-class, fast, offline-tolerant POS (table stakes — must be excellent or nothing else matters).
- A customer PWA that makes waiting fun and drives measurable repeat visits.
- A gamification + loyalty engine with real anti-abuse.
- AI assistants that turn data into plain-language actions.

**Non-Goals (v1)**
- Full accounting/GST filing suite (we export; we don't file).
- Third-party food-delivery aggregator management (Swiggy/Zomato) — Phase 3.
- Hardware manufacturing — we are software + standard peripheral integrations.

## 5. Core Modules (functional requirements)

### 5.1 POS System
- Menu with categories, modifiers, variants, combos.
- Order types: dine-in (table), takeaway, (delivery later).
- Billing with **GST** (CGST+SGST intra-state, IGST inter-state), HSN per item, item-level/bill-level discounts, service charge, rounding.
- Payments: **Cash, Card, UPI** (dynamic QR via Razorpay), **split payment** (by amount or by item), partial payment, tip.
- **Refunds**: full & partial, reason codes, manager approval.
- **Receipt printing**: thermal (58/80mm) + digital receipt to PWA/WhatsApp.
- **KOT (Kitchen Order Ticket)**: auto-route by item → station (kitchen/bar/dessert); modifications & cancellations push to KDS.
- Offline mode: queue orders & payments locally, sync on reconnect.
- Table management: floor map, table states (free/seated/billed), merge/transfer.

### 5.2 Inventory Management
- Stock items + **recipe/BOM** mapping (1 cappuccino = 18g beans + 150ml milk).
- Auto-deduct ingredients on order completion.
- **Waste tracking** with reasons (spoilage, spill, training, returns).
- **Purchase Orders** → vendor → goods receipt → stock-in.
- **Vendor management** (contacts, price lists, lead times, ratings).
- **Low-stock & expiry alerts** (push + dashboard).
- Stock counts / audits with variance reports.

### 5.3 Staff Management
- Roles & granular **permissions** (RBAC): Owner, Manager, Cashier, Kitchen, Waiter.
- **Attendance**: clock-in/out (PIN or QR), geofence optional.
- **Shift scheduling**: rota, swaps, overtime, labor-cost vs sales view.
- Per-staff sales & tips reporting; void/discount audit trail per user.

### 5.4 Analytics Dashboard
- Sales: daily / weekly / monthly, hour-of-day heatmap, day-part.
- **Profit reports** (revenue − COGS from recipes − labor).
- Best-sellers, **slow-movers**, menu-engineering quadrant (Stars/Plowhorses/Puzzles/Dogs).
- Customer cohort retention, repeat-rate, RFM segments.
- Game/loyalty analytics: reward redemption, point liability, engagement rate.

### 5.5 Customer QR Experience (PWA) — see [05](05-GAMIFICATION-AND-SOCIAL.md) & [07](07-UX-FLOWS.md)
- Table QR → instant PWA (no install). Home, live order status + ETA, loyalty wallet, today's offers, menu, games, social.
- **Order-Tracking Entertainment**: kitchen progress bar, live status, fun facts, brand story, mini-challenge, limited-time offer (our signature differentiator).
- In-PWA reorder & upsell ("Add fries for ₹49?").

### 5.6 Gamification, Social, Loyalty, Referral, Events — full spec in [05](05-GAMIFICATION-AND-SOCIAL.md)

### 5.7 AI Assistants (Sales, Inventory, Marketing) — full spec in [06](06-RETENTION-AND-AI.md)

## 6. Non-Functional Requirements
- **Performance:** POS action <100ms local; PWA first paint <1.5s on 4G.
- **Availability:** POS works offline; cloud target 99.9%.
- **Security:** RBAC, tenant isolation, PCI-safe (no card storage — Razorpay tokenization), PII encryption at rest.
- **Scale:** 10k outlets, 50k concurrent PWA sessions at peak.
- **Localization:** English + Hindi at launch; rupee/GST formats; future regional languages.
- **Accessibility:** WCAG AA on customer PWA; large-tap POS targets.

## 7. Success Metrics (per outlet, 90 days post-install)
- QR scan rate ≥ 35% of dine-in orders.
- Repeat-visit rate +15% vs baseline.
- AOV +8% via upsell + game add-ons.
- Waste −20% via forecasting.
- ≥ 25% of active customers in loyalty program.

## 8. Key Differentiators vs Traditional POS
1. **Wait-time monetization** — nobody else turns the queue into revenue.
2. **Gamified loyalty** with multiplayer rooms — social proof inside the cafe.
3. **AI assistants in plain language** — "Why are sales down?" answered.
4. **Owns the customer relationship** post-purchase (WhatsApp win-back).
5. **Margin via waste reduction**, not just top-line.
