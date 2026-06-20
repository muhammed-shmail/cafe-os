-- Phase G1 — SaaS Control Plane (Nuro7 platform layer)
-- Additive & idempotent. No drops, no data loss. Safe on a live DB.
-- Apply with: dotenv -e ../../.env -- prisma db execute --file ./prisma/migrations/0005_control_plane/migration.sql
--        or:  prisma db push against the updated schema.
--
-- Adds: Tenant.subdomain + 10 control-plane tables + 4 enum types.
-- Control-plane tables are NOT tenant-scoped (Nuro7 operates above tenants);
-- RLS for the tenant-linked ones is handled separately in rls.sql (Phase G3).

-- 0) Enum types (idempotent — Postgres has no CREATE TYPE IF NOT EXISTS).
DO $$ BEGIN CREATE TYPE "PlatformRole" AS ENUM ('super_admin','support','billing','readonly'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "BillingPeriod" AS ENUM ('monthly','quarterly','half_yearly','yearly'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "SubStatus" AS ENUM ('trialing','active','past_due','suspended','cancelled','expired'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE "TicketStatus" AS ENUM ('open','in_progress','waiting','resolved','closed'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 1) Tenant gets a subdomain slug for runtime resolution. Nullable → existing rows keep NULL.
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "subdomain" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "tenants_subdomain_key" ON "tenants" ("subdomain");

-- 2) Platform admins (Level-1 Nuro7 identity). Password + TOTP, never a PIN.
CREATE TABLE IF NOT EXISTS "platform_admins" (
  "id"           UUID           NOT NULL DEFAULT gen_random_uuid(),
  "email"        TEXT           NOT NULL,
  "name"         TEXT           NOT NULL,
  "passwordHash" TEXT           NOT NULL,
  "role"         "PlatformRole" NOT NULL DEFAULT 'super_admin',
  "totpSecret"   TEXT,
  "totpEnabled"  BOOLEAN        NOT NULL DEFAULT false,
  "active"       BOOLEAN        NOT NULL DEFAULT true,
  "lastLoginAt"  TIMESTAMPTZ(6),
  "createdAt"    TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "platform_admins_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "platform_admins_email_key" ON "platform_admins" ("email");

-- 3) Plan definitions (limits + features template; editable by Super Admin).
CREATE TABLE IF NOT EXISTS "plan_definitions" (
  "id"               UUID    NOT NULL DEFAULT gen_random_uuid(),
  "key"              "Plan"  NOT NULL,
  "name"             TEXT    NOT NULL,
  "maxBranches"      INTEGER,
  "maxStaff"         INTEGER,
  "maxCustomers"     INTEGER,
  "maxOrdersMonthly" INTEGER,
  "storageMb"        INTEGER,
  "features"         JSONB   NOT NULL DEFAULT '{}',
  "pricePaise"       JSONB   NOT NULL DEFAULT '{}',
  "active"           BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "plan_definitions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "plan_definitions_key_key" ON "plan_definitions" ("key");

-- 4) Subscriptions (one active per tenant).
CREATE TABLE IF NOT EXISTS "subscriptions" (
  "id"            UUID            NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"      UUID            NOT NULL,
  "planId"        UUID            NOT NULL,
  "period"        "BillingPeriod" NOT NULL DEFAULT 'monthly',
  "status"        "SubStatus"     NOT NULL DEFAULT 'trialing',
  "trialEndsAt"   TIMESTAMPTZ(6),
  "currentStart"  TIMESTAMPTZ(6)  NOT NULL DEFAULT now(),
  "currentEnd"    TIMESTAMPTZ(6),
  "slotOverrides" JSONB           NOT NULL DEFAULT '{}',
  "gateway"       TEXT,
  "gatewaySubId"  TEXT,
  "cancelAt"      TIMESTAMPTZ(6),
  "createdAt"     TIMESTAMPTZ(6)  NOT NULL DEFAULT now(),
  CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_tenantId_key" ON "subscriptions" ("tenantId");
CREATE INDEX IF NOT EXISTS "subscriptions_status_currentEnd_idx" ON "subscriptions" ("status", "currentEnd");

-- 5) Subscription invoices (manual in this phase; gateway fields reserved).
CREATE TABLE IF NOT EXISTS "sub_invoices" (
  "id"             UUID            NOT NULL DEFAULT gen_random_uuid(),
  "subscriptionId" UUID            NOT NULL,
  "amountPaise"    INTEGER         NOT NULL,
  "period"         "BillingPeriod" NOT NULL,
  "status"         TEXT            NOT NULL,
  "gatewayRef"     TEXT,
  "issuedAt"       TIMESTAMPTZ(6)  NOT NULL DEFAULT now(),
  "paidAt"         TIMESTAMPTZ(6),
  CONSTRAINT "sub_invoices_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "sub_invoices_subscriptionId_idx" ON "sub_invoices" ("subscriptionId");

-- 6) Usage counters (cheap slot meters; composite PK).
CREATE TABLE IF NOT EXISTS "usage_counters" (
  "tenantId"  UUID           NOT NULL,
  "metric"    TEXT           NOT NULL,
  "period"    TEXT           NOT NULL DEFAULT 'all',
  "value"     INTEGER        NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "usage_counters_pkey" PRIMARY KEY ("tenantId", "metric", "period")
);

-- 7) Tenant branding (white-label).
CREATE TABLE IF NOT EXISTS "tenant_branding" (
  "tenantId"     UUID    NOT NULL,
  "customDomain" TEXT,
  "logoUrl"      TEXT,
  "faviconUrl"   TEXT,
  "colors"       JSONB   NOT NULL DEFAULT '{}',
  "appName"      TEXT,
  "poweredBy"    BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "tenant_branding_pkey" PRIMARY KEY ("tenantId")
);
CREATE UNIQUE INDEX IF NOT EXISTS "tenant_branding_customDomain_key" ON "tenant_branding" ("customDomain");

-- 8) Support tickets + messages.
CREATE TABLE IF NOT EXISTS "support_tickets" (
  "id"         UUID           NOT NULL DEFAULT gen_random_uuid(),
  "tenantId"   UUID,
  "subject"    TEXT           NOT NULL,
  "body"       TEXT           NOT NULL,
  "priority"   TEXT           NOT NULL DEFAULT 'normal',
  "status"     "TicketStatus" NOT NULL DEFAULT 'open',
  "assignedTo" UUID,
  "createdBy"  UUID,
  "createdAt"  TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "support_tickets_status_priority_idx" ON "support_tickets" ("status", "priority");

CREATE TABLE IF NOT EXISTS "ticket_messages" (
  "id"         UUID           NOT NULL DEFAULT gen_random_uuid(),
  "ticketId"   UUID           NOT NULL,
  "authorKind" TEXT           NOT NULL,
  "authorId"   UUID,
  "body"       TEXT           NOT NULL,
  "createdAt"  TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "ticket_messages_pkey" PRIMARY KEY ("id")
);

-- 9) Announcements (platform → tenant broadcasts).
CREATE TABLE IF NOT EXISTS "announcements" (
  "id"          UUID           NOT NULL DEFAULT gen_random_uuid(),
  "title"       TEXT           NOT NULL,
  "body"        TEXT           NOT NULL,
  "audience"    TEXT           NOT NULL DEFAULT 'all',
  "publishedAt" TIMESTAMPTZ(6),
  "createdAt"   TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- 10) Platform audit (control-plane actions).
CREATE TABLE IF NOT EXISTS "platform_audit" (
  "id"             UUID           NOT NULL DEFAULT gen_random_uuid(),
  "adminId"        UUID,
  "action"         TEXT           NOT NULL,
  "targetTenantId" UUID,
  "meta"           JSONB,
  "ip"             TEXT,
  "createdAt"      TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "platform_audit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "platform_audit_targetTenantId_createdAt_idx" ON "platform_audit" ("targetTenantId", "createdAt");

-- 11) Foreign keys (added only if missing) — match Prisma referential actions.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_tenantId_fkey') THEN
    ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_planId_fkey') THEN
    ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_planId_fkey"
      FOREIGN KEY ("planId") REFERENCES "plan_definitions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sub_invoices_subscriptionId_fkey') THEN
    ALTER TABLE "sub_invoices" ADD CONSTRAINT "sub_invoices_subscriptionId_fkey"
      FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'usage_counters_tenantId_fkey') THEN
    ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_branding_tenantId_fkey') THEN
    ALTER TABLE "tenant_branding" ADD CONSTRAINT "tenant_branding_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'support_tickets_tenantId_fkey') THEN
    ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'support_tickets_assignedTo_fkey') THEN
    ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_assignedTo_fkey"
      FOREIGN KEY ("assignedTo") REFERENCES "platform_admins" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ticket_messages_ticketId_fkey') THEN
    ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_ticketId_fkey"
      FOREIGN KEY ("ticketId") REFERENCES "support_tickets" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'platform_audit_adminId_fkey') THEN
    ALTER TABLE "platform_audit" ADD CONSTRAINT "platform_audit_adminId_fkey"
      FOREIGN KEY ("adminId") REFERENCES "platform_admins" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
