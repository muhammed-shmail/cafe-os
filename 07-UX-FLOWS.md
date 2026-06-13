# 07 — UX Flows, Screen Hierarchy & Navigation

Four surfaces, each tuned to its user and context. Design language: clean, warm, "premium cafe" — rounded cards, soft shadows, a single brand accent per tenant (white-label), large tap targets, micro-animations on rewards. Dark mode on KDS & PWA.

---

## Surface 1 — Customer PWA (the magic; mobile-first, no install)

### Entry flow
```
Scan table QR ──► resolve outlet + table + branding
   │
   ├─ returning (cookie/phone) ──► Home (personalized)
   └─ new ──► light splash ──► [optional] phone OTP ──► Home
              (browsing works without login; earning rewards needs OTP)
```

### Screen hierarchy
```
PWA
├── Home  (default after scan)
│   ├── Live order status + ETA + kitchen progress bar
│   ├── Order-Tracking Entertainment carousel (facts/story/challenge/offer)
│   ├── Loyalty snapshot (points, coins, tier ring)
│   ├── Today's offers (personalized)
│   └── Quick actions: [Play] [Menu] [Rewards] [Invite]
├── Menu
│   ├── Categories → Item detail (modifiers, add)
│   ├── "Your Usual" / Recommended
│   └── Upsell prompts ("Add fries ₹49?")  → adds to live order
├── Order
│   ├── Current items + status timeline
│   ├── Add more (mid-wait upsell)
│   └── Pay / Split / Tip (scan-to-pay)
├── Play (Games hub)
│   ├── Single-player games grid (shows remaining plays)
│   ├── Multiplayer: Create Room / Join Code
│   └── Daily challenge
├── Rewards (Wallet)
│   ├── Points & coins balance + ledger
│   ├── Rewards catalog (redeem)
│   ├── My coupons (active/expiring)
│   └── Tier progress + perks
├── Community
│   ├── Leaderboard (daily/weekly/all-time)
│   ├── Badges (earned + locked)
│   ├── Feed (photos/reviews) [later]
│   └── Refer a friend
└── Profile
    ├── Visits, streaks, taste profile
    ├── Birthday/anniversary, preferences
    └── Notifications (WhatsApp/push opt-in)
```

### Bottom nav (5 tabs): **Home · Menu · Play · Rewards · Profile**

### Signature flow — "wait becomes play"
```
Order placed by counter ──► PWA Home shows ETA + progress
   ──► "Got 6 min? Play & earn" CTA
   ──► play 1–3 games (capped) ──► win coins + a coupon chance
   ──► "Add a brownie ₹30 while you wait?" ──► accepted → bigger bill
   ──► order ready ──► points credited ──► "Invite a friend, both get ₹50"
```

---

## Surface 2 — Tablet POS (staff; landscape, fast, offline)

### Layout (single-screen, minimal navigation)
```
┌───────────────┬───────────────────────────────┬──────────────────┐
│  Categories   │   Item grid (tap to add)      │   Cart / Ticket  │
│  (left rail)  │   [Coffee][Burgers][Combos]   │   2× Latte       │
│               │   ▢ ▢ ▢ ▢ ▢ ▢                 │   1× Fries       │
│  Tables ▸     │   ▢ ▢ ▢ ▢ ▢ ▢                 │   ----           │
│  Floor map    │                               │   Subtotal/GST   │
│               │                               │   [Send to KOT]  │
│               │                               │   [Charge ▸]     │
└───────────────┴───────────────────────────────┴──────────────────┘
```

### Flows
- **New order:** pick table (or takeaway) → add items + modifiers → Send to KOT → continue or Charge.
- **Charge:** choose method → Cash / UPI(QR) / Card / **Split** (by amount or item) → tip → print/share receipt.
- **Refund:** open order → select items → reason → manager PIN → process.
- **Offline:** banner "Offline — orders saved"; everything works; auto-sync on reconnect.

### Screen hierarchy
```
POS
├── Login (PIN)
├── Order screen (primary — above)
├── Tables (floor map: free/seated/billed, merge/transfer)
├── Open orders / KOT status
├── Quick reports (today's sales, my sales)
└── Settings (printer, drawer, station routing)
```

---

## Surface 3 — Kitchen Display System (KDS; dark, glanceable)

```
┌──────────┬──────────┬──────────┬──────────┐
│ #102 T3  │ #103 TA  │ #104 T7  │ #105 T1  │   each card:
│ 2 Latte  │ 1 Burger │ 3 Fries  │ 1 Pasta  │   - items + mods
│ 1 Fries  │ + no on. │          │          │   - timer (color
│ ⏱ 02:14  │ ⏱ 00:48  │ ⏱ 05:30 │ ⏱ 00:12  │     escalates red)
│ [Bump ✓] │ [Bump ✓] │ [Bump ✓] │ [Bump ✓] │   - bump to clear
└──────────┴──────────┴──────────┴──────────┘
   Station filter: [All][Kitchen][Bar][Dessert]   Oldest-first
```
- Realtime via Socket.IO. Color: green <2min, amber 2–5, red >5.
- Bump bar / touch to mark item or whole ticket ready → updates PWA progress bar.

---

## Surface 4 — Owner Dashboard (web; data-dense but calm)

### Screen hierarchy
```
Dashboard (Next.js)
├── Overview (Home)
│   ├── Today: sales, orders, AOV, footfall (live)
│   ├── AI Morning Briefing card (3 insights + actions)
│   └── Alerts (low stock, lapsed VIPs, anomalies)
├── Sales & Analytics
│   ├── Sales (day/week/month, heatmap)
│   ├── Profit & COGS
│   ├── Menu engineering (Stars/Plowhorses/Puzzles/Dogs)
│   └── Customers (retention cohorts, RFM, tiers)
├── Inventory
│   ├── Stock & alerts · Recipes/BOM
│   ├── Waste log & insights
│   └── Vendors & Purchase Orders
├── Staff
│   ├── Team & roles/permissions
│   ├── Attendance & shifts
│   └── Performance
├── Loyalty & Games
│   ├── Rules (earn rates, tiers, caps)
│   ├── Rewards catalog & coupons
│   ├── Games config & limits
│   └── Badges & leaderboards
├── Marketing (AI)
│   ├── Campaigns (WhatsApp/SMS/push) + AI drafts
│   ├── Segments
│   └── Automations (lifecycle)
├── AI Assistants
│   ├── Sales Assistant (chat)
│   └── Inventory Assistant (forecast)
├── Menu (catalog editor)
└── Settings (outlets, taxes/GST, printers, plan & billing, branding)
```

### Navigation pattern
- Left sidebar (collapsible) + top bar (outlet switcher, search, alerts, profile).
- Role-aware: cashier sees POS only; manager sees ops; owner sees everything.

---

## Wireframe principles & component notes
- **Reward moments are celebrated** — confetti/coin animations, haptics on the PWA; dopamine matters.
- **Progress is always visible** — rings/bars for tiers, streaks, "almost there."
- **One primary action per screen** (POS: Charge; PWA Home: Play; KDS: Bump).
- **Thumb-zone** bottom nav & CTAs on PWA; **landscape grid** on POS.
- **Accessibility:** WCAG AA contrast, ≥44px targets, reduced-motion option.
- **White-label theming:** tenant brand color + logo flow into PWA & receipts.

> Build the customer PWA and dashboard with the **frontend-design** / **ui-ux-pro-max** guidance (Next.js + Tailwind/shadcn). Suggested style: warm minimal + bento-grid dashboard, glassy reward cards, dark KDS.
