-- =========================================================================
-- Cafe OS — Row-Level Security (run AFTER `prisma migrate`/`db push`)
-- Prisma doesn't manage RLS, so apply this manually (or via a migration's
-- raw-SQL step). The app sets `app.current_tenant` per request; policies
-- scope every read/write to that tenant. Belt-and-suspenders alongside the
-- application-layer tenant interceptor.
--
-- Apply:  psql "$DIRECT_URL" -f packages/db/prisma/rls.sql
-- =========================================================================

-- Example for the orders table (replicate the pattern per tenant-scoped table).
-- `orders` reaches tenant via outlet; for hot tables we denormalize tenant_id
-- or join through a SECURITY DEFINER helper. Simplest correct version below
-- scopes by outlet ownership.

ALTER TABLE orders        ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers     ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_ledger ENABLE ROW LEVEL SECURITY;

-- helper: resolve the request's tenant from a GUC the app sets each connection
-- SELECT set_config('app.current_tenant', '<tenant-uuid>', false);

CREATE POLICY tenant_isolation_customers ON customers
  USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

CREATE POLICY tenant_isolation_orders ON orders
  USING (outlet_id IN (
    SELECT id FROM outlets WHERE tenant_id = current_setting('app.current_tenant', true)::uuid
  ));

-- NOTE: the bypass role used by migrations must have BYPASSRLS, e.g.:
--   ALTER ROLE cafeos_migrator BYPASSRLS;
-- The app connects as a NON-bypass role so policies are enforced.
