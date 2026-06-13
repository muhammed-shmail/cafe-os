# 09 — Roadmap & Feature Prioritization (MVP → Future)

Guiding principle: **the POS must be excellent first** (or nothing else gets used), then layer the engagement wedge that makes Cafe OS unique, then AI that defends the high tier.

---

## Prioritization Framework (RICE-lite)

Every feature scored on: **Owner value × Customer love × Build cost × Differentiation.** We ship things that are *cheap to build, high differentiation* first within the POS-credibility constraint.

---

## Phase 1 — MVP "Credible POS + Engagement Spark" (Months 0–4)

**Goal:** a cafe can run its whole day on Cafe OS, and customers experience the magic loop once.

**Must-have (P0)**
- POS: menu, cart, modifiers, dine-in/takeaway, GST billing, Cash/UPI(Razorpay)/Card, **split payment**, refund, thermal + digital receipt.
- KOT routing + **KDS** (realtime).
- Table management + **table QR**.
- Basic inventory: stock items, low-stock alerts, manual adjust (BOM optional this phase).
- Staff: PIN login, roles/permissions (RBAC), basic attendance.
- Analytics: daily/weekly/monthly sales, best/slow sellers.
- **Customer PWA core:** scan → order status + ETA + **kitchen progress bar** + **Order-Tracking Entertainment** carousel + menu + in-app upsell.
- **Loyalty core:** phone OTP, points earn on spend, tiers, rewards catalog, coupons.
- **One flagship game:** Spin the Wheel (server-authoritative) + anti-cheat basics (per-visit cap, signed sessions, device/phone binding).
- Offline-tolerant POS (outbox + sync).

**Why this set:** proves the *entire* differentiating loop (wait → play → earn → upsell → return) with the minimum surface, on top of a POS owners will actually adopt.

---

## Phase 2 — "Engagement Engine" (Months 4–8)

- More single-player games (Scratch, Trivia, Memory, Fast-Tap).
- **Multiplayer rooms** (Quiz Battle + Trivia Royale) — the signature social feature.
- **Badges & leaderboards** (Redis); streaks + **daily check-in**.
- **Referral system** with viral loops.
- **Birthday/anniversary** automation.
- Advanced inventory: **recipe/BOM auto-deduct, waste tracking, purchase orders, vendors**.
- Staff: **shift scheduling**, performance.
- WhatsApp campaigns (manual + templates) + FCM push.
- Analytics: profit/COGS, menu engineering, retention cohorts.

---

## Phase 3 — "AI & Scale" (Months 8–14)

- **AI Sales Assistant** ("why are sales down?") + Morning Briefing.
- **AI Inventory Assistant** (demand forecast, reorder, waste insights).
- **AI Marketing Assistant** (auto-segments, campaign drafts, autopilot lifecycle).
- Membership/subscription (Coffee Pass), prepaid wallet.
- Seasonal missions, mystery boxes, festival themes.
- Multi-outlet console; white-label theming.
- Community feed, UGC rewards, reviews.

---

## Phase 4 — "Network & Platform" (14m+)

- Cross-cafe loyalty network / shared identity graph.
- Franchise/enterprise controls, central menu, advanced RBAC.
- Marketplace (game packs, themes, campaign templates).
- Public API & integrations (accounting, aggregators).
- Benchmarking ("you vs similar cafes").
- Regional languages; deeper localization.

---

## MVP vs Future — quick table

| Feature | MVP (P1) | P2 | P3 | P4 |
|---|:--:|:--:|:--:|:--:|
| POS + GST + UPI/Cash/Card + split + refund | ✅ | | | |
| KOT + KDS realtime | ✅ | | | |
| Table QR + Customer PWA + order status | ✅ | | | |
| Order-Tracking Entertainment | ✅ | | | |
| Loyalty points + tiers + coupons | ✅ | | | |
| Spin Wheel + anti-cheat basics | ✅ | | | |
| Basic inventory + low-stock | ✅ | | | |
| RBAC + attendance | ✅ | | | |
| More games (scratch/trivia/memory) | | ✅ | | |
| Multiplayer rooms | | ✅ | | |
| Badges + leaderboards + streaks | | ✅ | | |
| Referral + birthday automation | | ✅ | | |
| BOM + waste + PO + vendors | | ✅ | | |
| Shift scheduling | | ✅ | | |
| WhatsApp campaigns (manual) | | ✅ | | |
| AI Sales / Inventory / Marketing | | | ✅ | |
| Membership / prepaid wallet | | | ✅ | |
| Multi-outlet + white-label | | | ✅ | |
| Cross-cafe network / marketplace / API | | | | ✅ |

---

## De-risking notes
- **Build POS on proven rails** (Razorpay, standard thermal ESC/POS) — don't reinvent payments/printing.
- **Anti-cheat from day one** on anything that pays real value — retrofitting trust is expensive.
- **One game, done beautifully** in MVP beats five mediocre ones.
- **Instrument everything** — the six growth levers ([README](README.md)) must be measurable from launch to prove ROI to owners and investors.
- **Design partners over features** — 20 cafes obsessively served > 200 features shipped.
