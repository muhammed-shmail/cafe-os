-- Phase A — Recipe-based inventory: auto-deduction + low-stock alerts
-- Additive & idempotent. Safe to run on a live DB (no drops, no data loss).
-- Apply with:  npm --workspace @cafeos/db run deploy
--          or: dotenv -e ../../.env -- prisma db execute --file ./prisma/migrations/0001_phase_a_recipe_inventory/migration.sql
-- (a plain `prisma db push` against the updated schema produces the same result.)

-- 1) Optional per-recipe unit (NULL ⇒ inherit the stock item's unit). Existing rows unaffected.
ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "unit" TEXT;

-- 2) Operational notifications / alerts (low-stock and beyond).
CREATE TABLE IF NOT EXISTS "notifications" (
  "id"        UUID         NOT NULL DEFAULT gen_random_uuid(),
  "outletId"  UUID         NOT NULL,
  "type"      TEXT         NOT NULL,
  "severity"  TEXT         NOT NULL DEFAULT 'info',
  "title"     TEXT         NOT NULL,
  "body"      TEXT,
  "entity"    TEXT,
  "entityId"  UUID,
  "meta"      JSONB,
  "readAt"    TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "notifications_outletId_createdAt_idx"
  ON "notifications" ("outletId", "createdAt");
CREATE INDEX IF NOT EXISTS "notifications_outletId_type_entityId_readAt_idx"
  ON "notifications" ("outletId", "type", "entityId", "readAt");

-- FK to outlets (guarded so re-runs don't error).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'notifications_outletId_fkey'
  ) THEN
    ALTER TABLE "notifications"
      ADD CONSTRAINT "notifications_outletId_fkey"
      FOREIGN KEY ("outletId") REFERENCES "outlets"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
