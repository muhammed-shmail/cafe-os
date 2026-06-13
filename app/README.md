# Cafe OS — Interactive Prototype (`/app`)

A working, zero-build prototype of all **four surfaces** from the spec, wired
together so the signature **"magic loop"** is live and demonstrable.

> Built to the **Phase 1 MVP** scope in [`../09-ROADMAP-MVP.md`](../09-ROADMAP-MVP.md),
> following the design language in [`../07-UX-FLOWS.md`](../07-UX-FLOWS.md).

## ▶ Run it

No install, no build step. Just open the file:

```
app/index.html      ← double-click, or drag into any browser
```

(Optional, for a clean origin) serve the folder:

```powershell
cd "app"; python -m http.server 8080   # then open http://localhost:8080
```

## The magic loop — try this

1. Open **POS** → pick items (try Spanish Latte — it has modifiers) → pick a table → **Charge** with UPI/Cash/Split.
2. Switch to **Kitchen** → your ticket is already there with a live timer that escalates green→amber→red. Tap it to **bump**.
3. Switch to **Customer** → the order-progress bar and ETA are live; the status follows your kitchen bumps. Tap **Play** → **Spin the wheel** → win coins (confetti!).
4. Switch to **Owner** → today's **sales & order count tick up** from the orders you just charged; ask the **AI Sales Assistant** a question.

Everything is connected through a tiny in-memory event bus — placing or advancing
an order on one surface updates the others in real time.

## What's implemented

| Surface | Highlights |
|---|---|
| **Tablet POS** | Category rail, searchable item grid, modifier sheet, live cart, **GST engine** (CGST/SGST split, discount, service charge, round-off — all in integer paise), floor map / table picker, dine-in vs takeaway, **Send to KOT**, charge flow with **UPI QR / Cash (change calc) / Card / Split**, tips. |
| **Kitchen Display** | Dark-roast theme, oldest-first ticket queue, **station filter** (All/Kitchen/Bar/Dessert), per-ticket timers with **green→amber→red escalation**, tap-to-bump, live counters. |
| **Customer PWA** | Rendered in a phone frame. Live **order tracking** (progress bar + ETA + 4-step timeline), **Order-Tracking Entertainment** carousel (facts/story/challenge/offer), loyalty snapshot, mid-wait **upsell**, **Spin-the-Wheel** game (weighted, server-authoritative pattern, per-visit cap), rewards wallet + redemption, tier ring, badges, referral, profile. |
| **Owner Dashboard** | Bento layout, **AI Morning Briefing**, live KPIs, 7-day bar chart, hour-of-day heatmap, **menu-engineering quadrant** (Stars/Plowhorses/Puzzles/Dogs), inventory alerts, **AI Sales Assistant** chat with canned-but-contextual answers, engagement metrics. |

## Architecture

```
app/
├── index.html              shell + surface switcher + home/launcher
├── styles/
│   ├── theme.css            design tokens, fonts, atoms, motion
│   └── surfaces.css         per-surface styles (chrome, home, POS, KDS, PWA, dashboard)
└── scripts/
    ├── data.js              seed: menu, modifiers, tables, customer, rewards, wheel, analytics
    ├── store.js             event bus + money/GST engine + live order store
    ├── shell.js             router, skin manager, toast + confetti
    ├── pos.js   kds.js   pwa.js   dashboard.js   (one module per surface)
```

- **Design system** maps to the spec's tokens (₹ paise, GST, multi-tenant naming).
  Aesthetic = *"Roasted Daylight"*: cream paper + espresso ink, **turmeric** primary,
  **cardamom** + **clay** accents; **Fraunces** display / **Hanken Grotesk** body /
  **DM Mono** numerals. KDS reskins to dark roast via `[data-skin="roast"]`.
- **State** is in-memory only (a real build swaps `store.js` for the NestJS REST +
  Socket.IO API in [`../04-API-STRUCTURE.md`](../04-API-STRUCTURE.md)).

## Not in this prototype (later phases)

Offline/IndexedDB sync, real Razorpay/WhatsApp/FCM, multiplayer rooms, recipe-BOM
auto-deduct, real Claude calls (the assistant is mocked), auth/RBAC enforcement —
all scoped to Phase 2–3 in the roadmap.
