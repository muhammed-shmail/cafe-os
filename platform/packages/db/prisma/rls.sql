-- =========================================================================
-- ChayaOne — Row-Level Security (Phase G3).  Run AFTER `prisma db push`/migrate.
-- Apply:  psql "$DIRECT_URL" -f packages/db/prisma/rls.sql   (idempotent, re-runnable)
--
-- WHY camelCase columns: Prisma keeps field names as column names (no snake_case
-- mapping), so columns are "tenantId" / "outletId" (quoted). Table names ARE
-- snake_case via @@map. (The previous scaffold referenced tenant_id/outlet_id,
-- which do not exist — this file corrects that.)
--
-- ENFORCEMENT MODEL: policies engage when the request sets the GUC
--   SELECT set_config('app.current_tenant', '<tenant-uuid>', true)
-- which the app does via withTenant() in apps/web/lib/context.ts. We use ENABLE
-- (not FORCE) row level security: the table OWNER bypasses RLS, so the app keeps
-- working today while routes adopt withTenant() incrementally. Final hardening =
-- FORCE + connect the app as a NON-owner / non-BYPASSRLS role + the migrator as
-- BYPASSRLS:  ALTER ROLE cafeos_migrator BYPASSRLS;
--
-- Control-plane tables (tenants, platform_admins, plan_definitions, subscriptions,
-- usage_counters, announcements, platform_audit) intentionally get NO tenant RLS —
-- Nuro7 operates above tenants and reaches them only as a platform principal.
-- =========================================================================

-- Helpers --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_current_tenant() RETURNS uuid AS $$
  SELECT NULLIF(current_setting('app.current_tenant', true), '')::uuid
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION app_tenant_outlets() RETURNS SETOF uuid AS $$
  SELECT "id" FROM outlets WHERE "tenantId" = app_current_tenant()
$$ LANGUAGE sql STABLE;

-- 1) Tables that carry tenantId directly ------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'outlets','staff_users','roles','vendors','customers','rewards_catalog',
    'coupons','games','badges','segments','campaigns',
    'tenant_branding','support_tickets'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING ("tenantId" = app_current_tenant())', t);
  END LOOP;
END $$;

-- 2) Tables scoped to the tenant via outletId -------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'categories','menu_items','modifier_groups','combos','tables_map','orders',
    'kots','payments','stock_items','stock_ledger','waste_logs','purchase_orders',
    'supplier_payments','attendance','shifts','audit_log','loyalty_ledger',
    'salary_payments','game_sessions','game_rooms','leaderboards',
    'daily_sales_rollup','item_sales_rollup','notifications'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING ("outletId" IN (SELECT app_tenant_outlets()))', t);
  END LOOP;
END $$;

-- 3) Child tables scoped through a parent (each has its own join expression) -
DO $$
DECLARE
  tbls  text[] := ARRAY[
    'order_items','modifiers','item_modifier_groups','combo_items','recipes',
    'refunds','purchase_order_items','customer_badges','streaks','referrals',
    'campaign_sends','game_room_players','sub_invoices','ticket_messages'
  ];
  exprs text[] := ARRAY[
    '"orderId" IN (SELECT "id" FROM orders WHERE "outletId" IN (SELECT app_tenant_outlets()))',
    '"groupId" IN (SELECT "id" FROM modifier_groups WHERE "outletId" IN (SELECT app_tenant_outlets()))',
    '"itemId" IN (SELECT "id" FROM menu_items WHERE "outletId" IN (SELECT app_tenant_outlets()))',
    '"comboId" IN (SELECT "id" FROM combos WHERE "outletId" IN (SELECT app_tenant_outlets()))',
    '"itemId" IN (SELECT "id" FROM menu_items WHERE "outletId" IN (SELECT app_tenant_outlets()))',
    '"orderId" IN (SELECT "id" FROM orders WHERE "outletId" IN (SELECT app_tenant_outlets()))',
    '"poId" IN (SELECT "id" FROM purchase_orders WHERE "outletId" IN (SELECT app_tenant_outlets()))',
    '"customerId" IN (SELECT "id" FROM customers WHERE "tenantId" = app_current_tenant())',
    '"customerId" IN (SELECT "id" FROM customers WHERE "tenantId" = app_current_tenant())',
    '"referrerId" IN (SELECT "id" FROM customers WHERE "tenantId" = app_current_tenant())',
    '"campaignId" IN (SELECT "id" FROM campaigns WHERE "tenantId" = app_current_tenant())',
    '"roomId" IN (SELECT "id" FROM game_rooms WHERE "outletId" IN (SELECT app_tenant_outlets()))',
    '"subscriptionId" IN (SELECT "id" FROM subscriptions WHERE "tenantId" = app_current_tenant())',
    '"ticketId" IN (SELECT "id" FROM support_tickets WHERE "tenantId" = app_current_tenant())'
  ];
  i int;
BEGIN
  FOR i IN 1 .. array_length(tbls, 1) LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbls[i]);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', tbls[i]);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (%s)', tbls[i], exprs[i]);
  END LOOP;
END $$;
