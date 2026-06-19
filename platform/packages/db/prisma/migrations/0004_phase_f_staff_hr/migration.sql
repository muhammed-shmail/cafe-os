-- Phase F — Staff / HR module: payroll fields + salary payments
-- Additive & idempotent. No drops, no data loss. Safe on a live DB.
-- Apply with: dotenv -e ../../.env -- prisma db execute --file ./prisma/migrations/0004_phase_f_staff_hr/migration.sql
--        or:  prisma db push against the updated schema.
--
-- Attendance + Shift tables already exist (Phase 1 schema) — this phase just
-- starts WRITING to them from the app; no change needed here.

-- 1) Employee ID + pay config on staff_users. Existing rows keep NULLs (unpaid/unset).
ALTER TABLE "staff_users" ADD COLUMN IF NOT EXISTS "employeeCode" TEXT;
ALTER TABLE "staff_users" ADD COLUMN IF NOT EXISTS "payType" TEXT;          -- 'monthly' | 'hourly'
ALTER TABLE "staff_users" ADD COLUMN IF NOT EXISTS "payRatePaise" INTEGER;  -- salary or hourly rate, paise

-- 2) Append-only salary / wage payments ledger.
CREATE TABLE IF NOT EXISTS "salary_payments" (
  "id"          UUID           NOT NULL DEFAULT gen_random_uuid(),
  "outletId"    UUID           NOT NULL,
  "staffId"     UUID           NOT NULL,
  "periodLabel" TEXT           NOT NULL,            -- e.g. '2026-06'
  "amountPaise" INTEGER        NOT NULL,
  "method"      TEXT           NOT NULL,            -- cash|upi|bank
  "note"        TEXT,
  "paidAt"      TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "createdById" UUID,
  CONSTRAINT "salary_payments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "salary_payments_outletId_staffId_idx" ON "salary_payments" ("outletId", "staffId");

-- FKs (added only if missing) — match Prisma onDelete: Cascade.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'salary_payments_outletId_fkey') THEN
    ALTER TABLE "salary_payments" ADD CONSTRAINT "salary_payments_outletId_fkey"
      FOREIGN KEY ("outletId") REFERENCES "outlets" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'salary_payments_staffId_fkey') THEN
    ALTER TABLE "salary_payments" ADD CONSTRAINT "salary_payments_staffId_fkey"
      FOREIGN KEY ("staffId") REFERENCES "staff_users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
