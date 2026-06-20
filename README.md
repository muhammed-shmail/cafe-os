# Cafe OS — The Growth Operating System for Cafes

> Not a POS. A **retention engine** disguised as a POS.
> Traditional POS ends at the receipt. Cafe OS begins there.

---

## The One-Line Pitch

**Cafe OS turns the 8–12 minutes a customer spends waiting for their order into a gamified, point-earning, socially-connected experience that makes them come back — while giving the owner a full POS, inventory, staff, and AI analytics stack underneath.**

---

## Why This Wins

Every cafe in India already has a POS. None of them own the customer relationship after the bill is printed. The receipt is the *last* touchpoint today. In Cafe OS, the receipt is the *first* touchpoint of a loyalty loop:

```
Order placed ──► QR scanned ──► Wait-time entertainment ──► Points earned
     ▲                                                            │
     │                                                            ▼
  Return visit ◄── WhatsApp nudge ◄── Reward unlocked ◄── Game played
```

The waiting time — currently dead, frustrating air — becomes the **single highest-engagement window** in the entire customer journey. That is the unfair advantage.

---

## Document Map

| # | Document | What's inside |
|---|----------|---------------|
| ★ | [ChayaOne — Platform Architecture](ChayaOne_Architecture.md) | As-built master overview: stack, RBAC, multi-tenancy, control plane, deployment |
| 01 | [Product Requirements (PRD)](01-PRD.md) | Vision, personas, all modules, scope |
| 02 | [Technical Architecture](02-TECH-ARCHITECTURE.md) | Stack, services, realtime, scaling, offline |
| 03 | [Database Schema](03-DATABASE-SCHEMA.md) | PostgreSQL multi-tenant schema, all tables |
| 04 | [API Structure](04-API-STRUCTURE.md) | REST + WebSocket contract, auth, events |
| 05 | [Gamification & Social](05-GAMIFICATION-AND-SOCIAL.md) | Games, multiplayer rooms, 100+ badges, referral, anti-cheat |
| 06 | [Retention & AI](06-RETENTION-AND-AI.md) | 50+ retention features, 3 AI assistants |
| 07 | [UX Flows & Screen Hierarchy](07-UX-FLOWS.md) | Wireframes, navigation, 4 surfaces |
| 08 | [Business: Pricing, GTM, Investor](08-BUSINESS.md) | SaaS tiers, competitive, go-to-market, pitch |
| 09 | [Roadmap & MVP Prioritization](09-ROADMAP-MVP.md) | What ships first, phased plan |
| 10 | [SaaS Control Plane](10-SAAS-CONTROL-PLANE.md) | Nuro7 platform layer: super-admin, subscriptions, slots, tenant isolation |

---

## The Four Surfaces

1. **Tablet POS** (staff) — billing, KOT, payments. Fast, offline-capable, glove-friendly.
2. **Kitchen Display System (KDS)** — order queue, prep timers, bump bar.
3. **Customer PWA** (the magic) — scan-to-engage: order status, games, rewards, social.
4. **Owner Dashboard** (web) — analytics, inventory, staff, AI assistants, marketing.

---

## The Six Growth Levers (our north-star metrics)

| Lever | Metric | How Cafe OS moves it |
|-------|--------|----------------------|
| Retention | Repeat-visit rate | Loyalty + streaks + WhatsApp win-back |
| Frequency | Visits / customer / month | Daily check-in, missions, FOMO offers |
| AOV | Avg order value | In-app upsell, game-won "add-on" coupons |
| Waste | Wastage % of COGS | AI demand forecast + ingredient tracking |
| Engagement | Wait-time interaction rate | Order-tracking entertainment + games |
| Community | Active social users | Leaderboards, multiplayer rooms, referrals |

---

## Naming & Conventions
- Currency: **₹ (INR)**, paise-precision stored as integers.
- Tax: **GST** (CGST/SGST/IGST) configurable per item HSN.
- Tenancy: **multi-tenant** — one platform, many cafes (`tenant` = cafe brand, `outlet` = physical location).
