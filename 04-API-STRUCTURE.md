# 04 — API Structure

Base: `https://api.cafeos.in/v1`. JSON. Auth via `Authorization: Bearer <jwt>`. All requests are tenant/outlet-scoped from the token (or `X-Outlet-Id` for multi-outlet staff). Errors follow RFC-7807 (`{type, title, status, detail}`). Idempotency via `Idempotency-Key` header on writes.

## Auth
```
POST   /auth/staff/login           { outlet_id, pin }            -> tokens
POST   /auth/staff/refresh         { refresh_token }
POST   /auth/customer/otp/request  { phone }                     -> sends OTP
POST   /auth/customer/otp/verify   { phone, otp, table_token? }  -> customer token + session
GET    /auth/me
```

## Catalog
```
GET    /menu?outlet_id=            -> categories + items + modifiers (cacheable)
POST   /menu/items                 (manager)   create item
PATCH  /menu/items/:id             update / toggle availability
POST   /menu/combos
GET    /menu/upsell?items=[ids]    -> AI/rule upsell suggestions for current cart
```

## Orders, KOT, Payments (POS)
```
POST   /orders                     create order (cart)            -> order
POST   /orders/sync                bulk offline replay (idempotent by client_uuid)
GET    /orders/:id
PATCH  /orders/:id/items           add / void items (pushes KOT)
POST   /orders/:id/kot             generate & route KOT(s)
POST   /orders/:id/discount        apply discount (audited)
POST   /orders/:id/settle          { payments:[{method,amount_paise}] }  split supported
POST   /payments/upi/intent        { order_id, amount_paise }     -> Razorpay QR/intent
POST   /payments/webhook/razorpay  (provider callback)
POST   /refunds                    { payment_id, amount_paise, reason }
GET    /orders/:id/receipt         -> printable + digital receipt payload
```

## KDS (realtime + REST fallback)
```
GET    /kds/queue?station=         current tickets
PATCH  /kds/items/:id              { kot_status: preparing|ready|served }
# WebSocket namespace: outlet:{id}:kds
#   <- kot.created, kot.item.updated, kot.cancelled
#   -> item.bump (kot_status change)
```

## Customer PWA
```
GET    /pwa/session?table_token=   resolve table -> outlet, branding, open order
GET    /pwa/order/:id/status       status + ETA + kitchen progress (also via WS order:{id})
GET    /pwa/loyalty                wallet: points, coins, tier, coupons
GET    /pwa/offers                 today's offers for this customer/outlet
POST   /pwa/order/:id/add          add item mid-wait (upsell accept)
GET    /pwa/home                   home payload (status, offers, games available, streak)
```

## Inventory & Supply
```
GET    /inventory/items            ?low_stock=true
POST   /inventory/items
POST   /inventory/waste            { stock_item_id, qty, reason }
POST   /inventory/count            stock audit -> variance
GET    /vendors  | POST /vendors
POST   /purchase-orders            create PO
POST   /purchase-orders/:id/receive  goods receipt -> stock_ledger +
GET    /inventory/alerts           low-stock & expiry
```

## Staff
```
GET    /staff  | POST /staff  | PATCH /staff/:id
POST   /staff/attendance/clock     { staff_id, action:'in'|'out', source }
GET    /staff/shifts  | POST /staff/shifts
GET    /staff/:id/performance      sales, voids, tips
```

## Loyalty, Games, Social
```
GET    /loyalty/:customerId/ledger
POST   /loyalty/earn               { customer_id, source, points }  (server-validated)
POST   /loyalty/redeem             { customer_id, reward_id }       -> coupon
GET    /rewards/catalog

GET    /games                      available games (respects per-visit limit)
POST   /games/:key/start           -> session token (server seeds RNG, anti-cheat)
POST   /games/sessions/:id/result  { signedResult }  -> validated reward
GET    /games/limits               remaining games this visit

POST   /rooms                      create multiplayer room -> join_code
POST   /rooms/:code/join
# WS namespace game-room:{roomId}: room.join, question.push, answer.submit, score.update, room.result

GET    /leaderboard?period=&metric=    (served from Redis sorted set)
GET    /badges/:customerId
POST   /referrals/redeem           { code }            on a new customer's first order
GET    /referrals/:customerId      status + invites
```

## Analytics
```
GET    /analytics/sales?range=day|week|month&from=&to=
GET    /analytics/profit?range=
GET    /analytics/items?sort=best|slow
GET    /analytics/menu-engineering      stars/plowhorses/puzzles/dogs
GET    /analytics/customers/retention   cohorts + RFM
GET    /analytics/loyalty               redemption, point liability, engagement
```

## AI Assistants (Gemini-backed, server-side)
```
POST   /ai/sales/ask        { question }   -> answer + cited metrics + actions
POST   /ai/inventory/forecast { item_id?, horizon_days }  -> demand + reorder suggestion
POST   /ai/marketing/campaign { goal, segment, channel }  -> draft copy + audience + schedule
GET    /ai/insights/daily   proactive "morning briefing" insights
```
*Implementation:* these endpoints invoke Gemini with tool-use; Gemini calls internal read-only analytics tools, then returns structured `{summary, findings[], recommendations[]}`. 1.5 Pro for reasoning-heavy asks; 1.5 Flash for classification/short copy. See [06](06-RETENTION-AND-AI.md).

## Campaigns & Notifications
```
GET/POST /segments
POST   /campaigns                  create (channel: whatsapp|sms|push)
POST   /campaigns/:id/send | /schedule
POST   /webhooks/whatsapp          delivery/read receipts
POST   /devices/register           FCM token for push
```

## Admin / Platform
```
GET    /tenants/:id/usage          plan limits & feature gates
PATCH  /tenants/:id/plan
GET    /outlets | POST /outlets
```

## Realtime Event Catalog (Socket.IO)
| Namespace | Server → Client | Client → Server |
|-----------|-----------------|-----------------|
| `outlet:{id}:kds` | `kot.created`, `kot.item.updated`, `kot.cancelled` | `item.bump` |
| `order:{id}` | `order.status`, `order.eta`, `kitchen.progress` | — |
| `game-room:{roomId}` | `room.update`, `question.push`, `score.update`, `room.result` | `room.join`, `answer.submit` |
| `outlet:{id}:leaderboard` | `leaderboard.tick` | — |

## Conventions
- Pagination: cursor-based (`?cursor=&limit=`).
- Versioning: URL `/v1`; breaking changes → `/v2`.
- Feature-gating: middleware returns `403 feature_not_in_plan` with upgrade hint.
- Webhooks signed (HMAC) and verified.
