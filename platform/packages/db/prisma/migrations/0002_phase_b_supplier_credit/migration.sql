-- Phase B — Supplier & credit purchase management
-- Additive & idempotent. No drops, no data loss. Safe on a live DB.
-- Apply with: dotenv -e ../../.env -- prisma db execute --file ./prisma/migrations/0002_phase_b_supplier_credit/migration.sql
--        or:  prisma db push against the updated schema.

-- 1) Supplier master extensions (credit profile + opening balance).
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "gstin" TEXT;
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "openingBalancePaise" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "vendors_tenantId_idx" ON "vendors" ("tenantId");

-- 2) Purchase invoice + credit fields on existing purchase_orders.
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "paidPaise" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "invoiceNo" TEXT;
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "invoiceDate" DATE;
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "dueDate" DATE;
ALTER TABLE "purchase_orders" ADD COLUMN IF NOT EXISTS "notes" TEXT;

CREATE INDEX IF NOT EXISTS "purchase_orders_outletId_createdAt_idx" ON "purchase_orders" ("outletId", "createdAt");
CREATE INDEX IF NOT EXISTS "purchase_orders_vendorId_idx" ON "purchase_orders" ("vendorId");

-- 3) Append-only supplier payments ledger.
CREATE TABLE IF NOT EXISTS "supplier_payments" (
  "id"          UUID         NOT NULL DEFAULT gen_random_uuid(),
  "outletId"    UUID         NOT NULL,
  "vendorId"    UUID         NOT NULL,
  "poId"        UUID,
  "amountPaise" INTEGER      NOT NULL,
  "method"      TEXT         NOT NULL,
  "reference"   TEXT,
  "note"        TEXT,
  "paidAt"      TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "createdById" UUID,
  "createdAt"   TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "supplier_payments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "supplier_payments_vendorId_paidAt_idx" ON "supplier_payments" ("vendorId", "paidAt");
CREATE INDEX IF NOT EXISTS "supplier_payments_outletId_paidAt_idx" ON "supplier_payments" ("outletId", "paidAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'supplier_payments_outletId_fkey') THEN
    ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_outletId_fkey"
      FOREIGN KEY ("outletId") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'supplier_payments_vendorId_fkey') THEN
    ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_vendorId_fkey"
      FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'supplier_payments_poId_fkey') THEN
    ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_poId_fkey"
      FOREIGN KEY ("poId") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
