# Cafe OS — Platform (production monorepo)

Fast-path build of the [Cafe OS](../README.md) software. **Phase 1 = the POS**, wired to a
real Postgres database and a server-authoritative GST engine. Other surfaces (KDS,
Customer PWA, Owner Dashboard) slot into the same monorepo next, per the 3-week plan.

> Stack (fast-path, per the agreed plan): **Next.js 14 (App Router) · Prisma · Postgres
> (Neon/Supabase) · Upstash Redis · Pusher realtime · Razorpay · Vercel**. The data
> model is faithful to [`../03-DATABASE-SCHEMA.md`](../03-DATABASE-SCHEMA.md), so a later
> migration to the doc's NestJS/AWS architecture is a lift-and-shift, not a rewrite.

## Layout

```
platform/
├── apps/
│   └── web/                  Next.js app (all surfaces; POS is live)
│       ├── app/
│       │   ├── page.tsx              surface launcher
│       │   ├── pos/                  ← POS surface (server page + client)
│       │   └── api/
│       │       ├── menu/             GET menu (categories + items)
│       │       ├── tables/           GET floor map
│       │       └── orders/           POST create/settle · GET list (KDS)
│       └── lib/context.ts            active-outlet resolver
├── packages/
│   ├── db/        Prisma schema (full, from the DB doc) + client + seed + RLS
│   ├── core/      money (paise) · GST engine · zod DTOs   ← shared by client + server
│   └── ui/        design tokens ("Roasted Daylight") + Tailwind preset
├── package.json  turbo.json  tsconfig.base.json  .env.example
```

## Setup — local first (no Docker, no cloud)

Development runs against a **real Postgres** started from an embedded binary —
no Docker, no install, no signup. Data persists in `packages/db/.localdb`.
Because it's genuine Postgres, going to cloud later is just swapping `DATABASE_URL`.

```bash
cd platform
npm install                    # installs workspaces (downloads the PG binary on first db:local)
cp .env.example .env           # defaults already point at the local DB — no edits needed

# Terminal 1 — start the local database (leave it running):
npm run db:local               # 🐘 Postgres on localhost:5433  (first run downloads the binary)

# Terminal 2 — set up schema + data, then run the app:
npm run db:generate            # prisma client
npm run db:push                # create tables
npm run db:seed                # Kahwa House: menu, tables, staff PINs, 1 customer
npm run dev                    # http://localhost:3000  →  open /pos
```

Staff PINs (seeded): Owner `1111` · Cashier `2222` · Kitchen `3333`.

### Push to cloud (later, unchanged code)

When you're ready, provision Neon/Supabase (free tier), then in `.env` comment out the
local URLs and uncomment the cloud ones. Run `npm run db:push && npm run db:seed`
against the cloud DB. **No schema or code changes** — same Postgres engine throughout.
Optional hardening before real multi-tenant data: `psql "$DIRECT_URL" -f packages/db/prisma/rls.sql`.

## What the POS does (Phase 1, wired end-to-end)

- Loads menu + tables from the DB (server component).
- Real **GST engine** in [`packages/core/src/gst.ts`](packages/core/src/gst.ts) — CGST/SGST split,
  discount distribution, service charge, round-off; **the same function runs on the
  client (live cart) and the server (authoritative total)**, so they can never disagree.
- `POST /api/orders` writes order + items + KOTs in a **transaction**, is **idempotent on
  `clientUuid`** (offline-outbox safe), optionally **settles** with a payment, and credits
  **loyalty points** to the customer ledger.
- Verify the engine: `npm run -w @cafeos/core test`.

## Immediate next tickets (Week 1–2 of the plan)

1. **Auth** — staff PIN login (seeded: Owner `1111`, Cashier `2222`), session → outlet, set RLS GUC.
2. **Razorpay** — replace the mock UPI QR with a real dynamic-QR + webhook reconcile route.
3. **Realtime** — Pusher: emit `order.new` on create; build `/kds` consuming it (the prototype
   in [`../app`](../app) is the UX spec).
4. **Customer PWA** `/app` — QR resolve → order status → Spin-the-Wheel (server-authoritative).
5. **Offline outbox** — IndexedDB queue replaying to `/api/orders` (idempotency is already in place).

## Notes
- Money is **integer paise** everywhere. Never floats.
- The visual prototype in [`../app`](../app) stays as the design reference for the surfaces
  not yet ported.
- RLS is defined but applied manually ([`packages/db/prisma/rls.sql`](packages/db/prisma/rls.sql)) —
  enable it before any real multi-tenant data lands.
