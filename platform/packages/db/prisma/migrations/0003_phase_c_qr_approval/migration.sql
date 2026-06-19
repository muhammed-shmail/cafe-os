-- Phase C — QR ordering + waiter approval workflow
-- Additive & idempotent. Existing POS orders keep working unchanged.
-- Apply with: dotenv -e ../../.env -- prisma db execute --file ./prisma/migrations/0003_phase_c_qr_approval/migration.sql
--        or:  prisma db push against the updated schema.

-- 1) New order lifecycle states (append to enum; safe, never removes values).
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'pending_approval';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'approved';

-- 2) Order channel enum.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OrderChannel') THEN
    CREATE TYPE "OrderChannel" AS ENUM ('pos', 'qr', 'online');
  END IF;
END $$;

-- 3) Channel + approval trail on orders. channel defaults to 'pos' so every
--    existing row is treated as a till order needing no approval.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "channel" "OrderChannel" NOT NULL DEFAULT 'pos';
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "approvedById" UUID;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMPTZ(6);
