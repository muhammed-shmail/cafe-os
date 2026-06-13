# 03 — Database Schema (PostgreSQL)

Multi-tenant. Every business table carries `tenant_id` (brand) and, where physical, `outlet_id`. Money stored as **integer paise** (`amount_paise`) to avoid float errors. Timestamps `timestamptz`. Soft-delete via `deleted_at` where needed.

> Notation below is illustrative DDL. PK = `id uuid default gen_random_uuid()` unless noted.

## 1. Tenancy & Identity

```sql
CREATE TABLE tenants (            -- the cafe brand / SaaS account
  id uuid PRIMARY KEY,
  name text NOT NULL,
  plan text NOT NULL DEFAULT 'starter',   -- starter|growth|pro|enterprise
  gstin text,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE outlets (            -- a physical location
  id uuid PRIMARY KEY,
  tenant_id uuid REFERENCES tenants,
  name text, address jsonb, gstin text,
  state_code text,               -- for CGST/SGST vs IGST
  timezone text DEFAULT 'Asia/Kolkata',
  settings jsonb DEFAULT '{}'
);

CREATE TABLE staff_users (
  id uuid PRIMARY KEY,
  tenant_id uuid, outlet_id uuid,
  name text, phone text, email text,
  pin_hash text,                 -- fast POS login
  role text,                     -- owner|manager|cashier|kitchen|waiter
  permissions jsonb DEFAULT '[]',
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE roles (             -- optional custom roles
  id uuid PRIMARY KEY, tenant_id uuid, name text, permissions jsonb
);
```

## 2. Catalog / Menu

```sql
CREATE TABLE categories (id uuid PK, outlet_id uuid, name text, sort int);

CREATE TABLE menu_items (
  id uuid PRIMARY KEY,
  outlet_id uuid, category_id uuid,
  name text, description text, image_url text,
  price_paise int NOT NULL,
  hsn_code text, gst_rate numeric(4,2),   -- e.g. 5.00, 18.00
  is_available boolean DEFAULT true,
  station text,                            -- kitchen|bar|dessert  (KOT routing)
  tags text[]                              -- veg, bestseller, spicy
);

CREATE TABLE modifier_groups (id uuid PK, outlet_id uuid, name text, min int, max int);
CREATE TABLE modifiers (id uuid PK, group_id uuid, name text, price_paise int);
CREATE TABLE item_modifier_groups (item_id uuid, group_id uuid);

CREATE TABLE combos (id uuid PK, outlet_id uuid, name text, price_paise int);
CREATE TABLE combo_items (combo_id uuid, item_id uuid, qty int);
```

## 3. Orders, KOT & Payments

```sql
CREATE TABLE tables_map (         -- dine-in tables, each has a QR
  id uuid PRIMARY KEY, outlet_id uuid,
  label text,                     -- "T3"
  qr_token text UNIQUE,           -- encoded in the table QR
  state text DEFAULT 'free'       -- free|seated|billed
);

CREATE TABLE orders (
  id uuid PRIMARY KEY,
  client_uuid uuid UNIQUE,        -- idempotency for offline sync
  outlet_id uuid, table_id uuid, customer_id uuid,
  staff_id uuid,
  type text,                      -- dine_in|takeaway|delivery
  status text,                    -- open|in_kitchen|ready|served|settled|cancelled
  subtotal_paise int, discount_paise int,
  cgst_paise int, sgst_paise int, igst_paise int,
  service_charge_paise int, round_off_paise int,
  total_paise int,
  placed_at timestamptz DEFAULT now(),
  settled_at timestamptz
);

CREATE TABLE order_items (
  id uuid PRIMARY KEY, order_id uuid, item_id uuid,
  name_snapshot text, qty int, unit_price_paise int,
  modifiers jsonb, notes text,
  station text, kot_status text DEFAULT 'queued'  -- queued|preparing|ready|served|void
);

CREATE TABLE kots (               -- a printed/displayed ticket (subset of items)
  id uuid PRIMARY KEY, order_id uuid, outlet_id uuid,
  station text, number int, status text, created_at timestamptz
);

CREATE TABLE payments (
  id uuid PRIMARY KEY, order_id uuid, outlet_id uuid,
  method text,                    -- cash|card|upi|wallet|points
  amount_paise int,
  status text,                    -- pending|success|failed|refunded
  provider_ref text,              -- razorpay payment id
  meta jsonb, created_at timestamptz DEFAULT now()
);

CREATE TABLE refunds (
  id uuid PRIMARY KEY, payment_id uuid, order_id uuid,
  amount_paise int, reason text, approved_by uuid,
  provider_ref text, created_at timestamptz DEFAULT now()
);
```

## 4. Inventory & Supply

```sql
CREATE TABLE stock_items (
  id uuid PRIMARY KEY, outlet_id uuid,
  name text, unit text,           -- g, ml, pcs
  qty_on_hand numeric(12,3), reorder_level numeric(12,3),
  avg_cost_paise int, expiry_tracking boolean DEFAULT false
);

CREATE TABLE recipes (            -- BOM: menu_item -> stock usage
  id uuid PRIMARY KEY, item_id uuid, stock_item_id uuid, qty numeric(12,3)
);

CREATE TABLE stock_ledger (       -- every movement, append-only
  id uuid PRIMARY KEY, outlet_id uuid, stock_item_id uuid,
  change numeric(12,3),           -- +receive / -consume / -waste / +adjust
  reason text,                    -- sale|waste|purchase|adjustment|count
  ref_id uuid, created_at timestamptz DEFAULT now()
);

CREATE TABLE waste_logs (
  id uuid PRIMARY KEY, outlet_id uuid, stock_item_id uuid,
  qty numeric(12,3), reason text, -- spoilage|spill|training|return
  cost_paise int, logged_by uuid, created_at timestamptz DEFAULT now()
);

CREATE TABLE vendors (id uuid PK, tenant_id uuid, name text, contact jsonb, rating numeric(2,1), lead_time_days int);
CREATE TABLE purchase_orders (
  id uuid PRIMARY KEY, outlet_id uuid, vendor_id uuid,
  status text,                    -- draft|sent|received|partial|cancelled
  total_paise int, expected_at date, created_at timestamptz DEFAULT now()
);
CREATE TABLE purchase_order_items (po_id uuid, stock_item_id uuid, qty numeric, unit_cost_paise int);
```

## 5. Staff Ops

```sql
CREATE TABLE attendance (
  id uuid PRIMARY KEY, outlet_id uuid, staff_id uuid,
  clock_in timestamptz, clock_out timestamptz, source text  -- pin|qr|geo
);
CREATE TABLE shifts (
  id uuid PRIMARY KEY, outlet_id uuid, staff_id uuid,
  starts_at timestamptz, ends_at timestamptz, role text, status text
);
CREATE TABLE audit_log (
  id uuid PRIMARY KEY, outlet_id uuid, actor_id uuid,
  action text, entity text, entity_id uuid, before jsonb, after jsonb,
  created_at timestamptz DEFAULT now()
);
```

## 6. Customers & Loyalty

```sql
CREATE TABLE customers (
  id uuid PRIMARY KEY, tenant_id uuid,
  phone text, phone_hash text, name text,
  birthday date, anniversary date,
  tier text DEFAULT 'bronze',     -- bronze|silver|gold|vip
  points int DEFAULT 0, coins int DEFAULT 0,
  lifetime_spend_paise int DEFAULT 0,
  visit_count int DEFAULT 0, last_visit timestamptz,
  referral_code text UNIQUE, referred_by uuid,
  device_fingerprints text[],     -- anti-abuse
  created_at timestamptz DEFAULT now()
);

CREATE TABLE loyalty_ledger (     -- every point/coin earn & burn, append-only
  id uuid PRIMARY KEY, customer_id uuid, outlet_id uuid,
  type text,                      -- earn|burn|expire|adjust
  points int, coins int,
  source text,                    -- order|game|referral|checkin|birthday|streak
  ref_id uuid, created_at timestamptz DEFAULT now()
);

CREATE TABLE rewards_catalog (
  id uuid PRIMARY KEY, tenant_id uuid,
  name text, type text,           -- coupon|free_item|bogo|cashback|topping
  cost_points int, value jsonb, stock int, active boolean
);

CREATE TABLE coupons (
  id uuid PRIMARY KEY, tenant_id uuid, customer_id uuid,
  code text UNIQUE, reward_id uuid,
  status text,                    -- issued|redeemed|expired
  source text, expires_at timestamptz,
  redeemed_order_id uuid, created_at timestamptz DEFAULT now()
);
```

## 7. Gamification & Social

```sql
CREATE TABLE games (id uuid PK, tenant_id uuid, key text, name text, config jsonb, active boolean);

CREATE TABLE game_sessions (
  id uuid PRIMARY KEY, customer_id uuid, outlet_id uuid, game_id uuid,
  order_id uuid,                  -- tie a game to a visit/order
  result jsonb, reward_coupon_id uuid,
  device_fingerprint text, ip inet,
  started_at timestamptz, ended_at timestamptz
);

CREATE TABLE game_rooms (
  id uuid PRIMARY KEY, outlet_id uuid, host_customer_id uuid,
  join_code text, game_key text, status text,  -- lobby|playing|finished
  config jsonb, created_at timestamptz DEFAULT now()
);
CREATE TABLE game_room_players (room_id uuid, customer_id uuid, score int, joined_at timestamptz);

CREATE TABLE badges (
  id uuid PRIMARY KEY, tenant_id uuid, key text, name text,
  description text, icon text, criteria jsonb, tier text  -- bronze|silver|gold
);
CREATE TABLE customer_badges (customer_id uuid, badge_id uuid, earned_at timestamptz);

CREATE TABLE leaderboards (       -- snapshot/config; live ranks live in Redis
  id uuid PRIMARY KEY, outlet_id uuid, period text, metric text  -- points|visits|games
);

CREATE TABLE streaks (
  customer_id uuid, kind text,    -- daily_checkin|weekly_visit
  current int, longest int, last_at date
);

CREATE TABLE referrals (
  id uuid PRIMARY KEY, referrer_id uuid, referred_id uuid,
  status text,                    -- pending|qualified|rewarded
  reward_coupon_id uuid, created_at timestamptz DEFAULT now()
);
```

## 8. Campaigns & Notifications

```sql
CREATE TABLE segments (id uuid PK, tenant_id uuid, name text, rules jsonb);
CREATE TABLE campaigns (
  id uuid PRIMARY KEY, tenant_id uuid, channel text,  -- whatsapp|sms|push
  segment_id uuid, template jsonb, status text,
  scheduled_at timestamptz, created_by uuid
);
CREATE TABLE campaign_sends (
  id uuid PRIMARY KEY, campaign_id uuid, customer_id uuid,
  status text, sent_at timestamptz, opened_at timestamptz, clicked_at timestamptz
);
```

## 9. Analytics Rollups (precomputed)

```sql
CREATE TABLE daily_sales_rollup (
  outlet_id uuid, day date,
  orders int, gross_paise int, discount_paise int, tax_paise int,
  cogs_paise int, net_paise int,
  PRIMARY KEY (outlet_id, day)
);
CREATE TABLE item_sales_rollup (outlet_id uuid, day date, item_id uuid, qty int, revenue_paise int);
```

## Key Indexes
- `orders(outlet_id, placed_at)`, `orders(status)`, `order_items(order_id)`.
- `loyalty_ledger(customer_id, created_at)`, `customers(phone_hash)`, `customers(referral_code)`.
- `game_sessions(customer_id, started_at)`, `stock_ledger(stock_item_id, created_at)`.
- Partial index `coupons(customer_id) WHERE status='issued'`.

## Design Principles
- **Append-only ledgers** (`loyalty_ledger`, `stock_ledger`, `audit_log`) → trustworthy balances are derived/cached, never overwritten.
- **Snapshots on transactional rows** (`name_snapshot`) → historical bills don't change when the menu does.
- **Idempotency** via `client_uuid` on orders → safe offline sync.
- **Redis owns the hot path** for leaderboards & rate limits; Postgres is source of truth.
