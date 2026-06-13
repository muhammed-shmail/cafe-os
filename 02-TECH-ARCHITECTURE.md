# 02 — Technical Architecture

## 1. Stack (confirmed)

| Layer | Technology | Why |
|-------|-----------|-----|
| Web frontend (dashboard + PWA) | **Next.js (React)** + TypeScript | SSR/ISR for marketing+dashboard, PWA for customer app |
| Mobile (owner app, optional) | **React Native (Expo)** | Code reuse, push, camera/QR |
| Backend | **Node.js + NestJS** | Modular, DI, TypeScript end-to-end, great for domain modules |
| Database (last we study about other platform)| **PostgreSQL** | Relational integrity for money/inventory; JSONB for flexible config |
| Cache / queues | **Redis** | Sessions, leaderboards (sorted sets!), rate-limit, BullMQ jobs |
| Realtime | **Socket.IO** | KDS, order status, multiplayer rooms, live leaderboard |
| Object storage | **AWS S3** | Receipts, images, exports, brand assets |
| Cloud | **AWS** (ECS Fargate / EKS) | Managed, scalable |
| Payments | **Razorpay** | UPI dynamic QR, cards, settlement, refunds |
| Messaging | **WhatsApp Cloud API**, **Firebase Cloud Messaging** | Campaigns + push |
| AI | **Anthropic Claude API** (Opus 4.8 / Haiku 4.5) | Assistants, forecasting copilots, campaign copy |
| Search/analytics (later) | ClickHouse or Postgres + Timescale | High-volume event analytics |

## 2. System Diagram (logical)

```
                          ┌─────────────────────────────────────┐
                          │            CLIENTS                   │
   Tablet POS (PWA) ──┐   │  KDS (web)   Owner Dashboard (Next)  │
   Customer PWA ──────┼──►│  Owner Mobile (React Native)        │
                      │   └─────────────────────────────────────┘
                      ▼
            ┌──────────────────────┐      ┌────────────────────────┐
            │   API Gateway / LB   │◄────►│  Socket.IO Gateway     │  (realtime: KDS,
            │   (NestJS REST)      │      │  (Redis adapter)       │   order status, rooms)
            └──────────┬───────────┘      └───────────┬────────────┘
                       │                              │
        ┌──────────────┼──────────────────────────────┼───────────────┐
        ▼              ▼              ▼                ▼               ▼
   ┌─────────┐   ┌──────────┐   ┌──────────┐   ┌─────────────┐  ┌──────────┐
   │  POS &  │   │Inventory │   │ Loyalty &│   │  Realtime/  │  │   AI     │
   │ Orders  │   │ & Supply │   │  Games   │   │  Rooms svc  │  │ Service  │
   └────┬────┘   └────┬─────┘   └────┬─────┘   └──────┬──────┘  └────┬─────┘
        │             │              │                │              │
        └─────────────┴──────┬───────┴────────────────┴──────────────┘
                             ▼
        ┌──────────────┐  ┌────────┐  ┌──────────┐  ┌──────────────────┐
        │ PostgreSQL   │  │ Redis  │  │  S3      │  │ BullMQ workers   │
        │ (primary)    │  │(cache, │  │ (assets) │  │ (jobs: KOT print,│
        │ + read replica│ │ leaderb)│ │          │  │  WhatsApp, AI,   │
        └──────────────┘  └────────┘  └──────────┘  │  forecasts)      │
                                                     └──────────────────┘
   External: Razorpay │ WhatsApp Cloud API │ FCM │ Anthropic Claude API
```

## 3. Service / Module Decomposition (NestJS modules)

- **auth** — JWT (access+refresh), device/PIN login for POS, customer OTP (phone) for PWA, RBAC guards.
- **tenancy** — tenant & outlet resolution, plan/feature-gating middleware.
- **catalog** — menu, categories, modifiers, combos, pricing, taxes (HSN/GST).
- **orders** — cart → order → KOT → settle; state machine; offline reconciliation.
- **payments** — Razorpay integration, split, refund, reconciliation, webhooks.
- **inventory** — items, recipes/BOM, stock ledger, waste, PO, vendors, alerts.
- **staff** — users, roles/permissions, attendance, shifts.
- **loyalty** — points/coins wallet, tiers, earn/burn rules, ledger.
- **games** — game catalog, sessions, reward issuance, anti-cheat.
- **rooms** — multiplayer realtime rooms, matchmaking, scoring.
- **social** — leaderboards, badges/achievements, referrals.
- **campaigns** — segments, WhatsApp/SMS/push sends, automation triggers.
- **analytics** — aggregations, reports, menu engineering.
- **ai** — Claude-backed assistants (sales, inventory, marketing) with tool/function calling into our own analytics APIs.
- **notifications** — FCM + WhatsApp dispatch, templating.

## 4. Realtime Design (Socket.IO + Redis adapter)

Namespaces / rooms:
- `outlet:{id}:kds` — kitchen subscribes; receives `kot.created`, `kot.item.updated`, `kot.cancelled`.
- `order:{id}` — customer PWA subscribes; receives `order.status`, `order.eta`, `kitchen.progress`.
- `game-room:{roomId}` — multiplayer; `room.join`, `question.push`, `answer.submit`, `score.update`, `room.result`.
- `outlet:{id}:leaderboard` — live ranking ticks.

Redis Pub/Sub adapter lets Socket.IO scale horizontally across nodes. Leaderboards use **Redis Sorted Sets** (`ZADD`, `ZREVRANGE`) for O(log n) ranking.

## 5. Offline-First POS Strategy

- POS is a PWA with **IndexedDB** local store + service worker.
- Menu, prices, tax config cached locally on login.
- Orders created offline get a client UUID + monotonic local sequence; queued in an outbox.
- On reconnect: outbox replays to `/orders/sync` (idempotent via client UUID). Server resolves conflicts (e.g., stock) and returns canonical state.
- Payments: cash works fully offline; UPI/card require connectivity (graceful fallback to "mark as paid → reconcile").

## 6. AI Service Pattern

Claude is called server-side only (keys never on client). Pattern = **tool use / function calling**:
1. User asks AI assistant a question in dashboard.
2. NestJS `ai` module sends prompt + a toolset (`get_sales`, `get_top_items`, `get_inventory`, `get_forecast`) to **Claude (Opus 4.8 for reasoning, Haiku 4.5 for cheap/fast tasks)**.
3. Claude calls our internal analytics tools → we execute SQL → return JSON → Claude synthesizes a plain-language, India-context answer with recommended actions.
4. Responses cached (Redis) where deterministic. Prompt caching used for the system/schema context to cut cost.

See [06](06-RETENTION-AND-AI.md) for assistant specs and [04](04-API-STRUCTURE.md) §AI for endpoints.

## 7. Security & Compliance
- Multi-tenant isolation enforced at the query layer (every query scoped by `tenant_id`/`outlet_id` via a request-context interceptor); critical tables also use Postgres 
**Row-Level Security**.
- No PAN/card data stored — Razorpay tokenization; we store only payment references.
- PII (phone, name) encrypted at rest; phone hashed for lookups.
- Audit log for voids, refunds, discounts, permission changes.
- Rate limiting (Redis) on PWA game/reward endpoints to stop abuse (see anti-cheat in [05](05-GAMIFICATION-AND-SOCIAL.md)).

## 8. Environments & DevOps
- IaC: Terraform; containers on ECS Fargate (autoscale) behind ALB.
- CI/CD: GitHub Actions → build → test → deploy (blue/green).
- Observability: OpenTelemetry → Grafana/Loki/Tempo; Sentry for client errors.
- Backups: automated Postgres snapshots + PITR; S3 versioning.

## 9. Scaling Notes
- Read replicas for analytics-heavy dashboard queries.
- Heavy aggregations precomputed nightly into summary tables (`daily_sales_rollup`).
- Game/leaderboard traffic isolated to Redis; never hits Postgres on the hot path.
- WhatsApp/FCM/AI all async via BullMQ to protect request latency.