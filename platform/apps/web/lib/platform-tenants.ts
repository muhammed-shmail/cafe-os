import { createHash, randomInt } from 'node:crypto';
import { prisma } from '@cafeos/db';

/**
 * ChayaOne — tenant provisioning & lifecycle (Phase G5). Reuses the same shape
 * the dev seed creates, parameterised: Tenant → Subscription(trialing) → first
 * Outlet → owner StaffUser (temp PIN) → TenantBranding → UsageCounters. All in
 * one transaction so a half-provisioned tenant can never exist.
 */
const pinHash = (p: string) => createHash('sha256').update(p).digest('hex');
const monthKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export type PlanKey = 'starter' | 'growth' | 'pro' | 'enterprise';

export type CreateTenantInput = {
  name: string;
  subdomain: string;
  planKey: PlanKey;
  ownerName: string;
  ownerPhone?: string;
  outletName?: string;
  stateCode?: string;
};

export async function createTenant(input: CreateTenantInput): Promise<{ tenantId: string; ownerPin: string }> {
  const sub = input.subdomain.toLowerCase().trim();
  if (!/^[a-z0-9-]{2,40}$/.test(sub)) throw new Error('invalid_subdomain');

  const plan = await prisma.planDefinition.findUnique({ where: { key: input.planKey }, select: { id: true } });
  if (!plan) throw new Error('plan_not_found');
  const taken = await prisma.tenant.findUnique({ where: { subdomain: sub }, select: { id: true } });
  if (taken) throw new Error('subdomain_taken');

  const pin = String(randomInt(1000, 10000)); // 4-digit temp owner PIN
  const now = new Date();
  const trialEnds = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  const tenantId = await prisma.$transaction(async (tx) => {
    const t = await tx.tenant.create({
      data: { name: input.name.trim(), subdomain: sub, plan: input.planKey, status: 'active' },
    });
    await tx.subscription.create({
      data: {
        tenantId: t.id,
        planId: plan.id,
        period: 'monthly',
        status: 'trialing',
        trialEndsAt: trialEnds,
        currentStart: now,
        currentEnd: trialEnds,
      },
    });
    const outlet = await tx.outlet.create({
      data: {
        tenantId: t.id,
        name: input.outletName?.trim() || input.name.trim(),
        stateCode: (input.stateCode || 'KA').toUpperCase().slice(0, 2),
      },
    });
    await tx.staffUser.create({
      data: {
        tenantId: t.id,
        outletId: outlet.id,
        name: input.ownerName.trim(),
        phone: input.ownerPhone?.trim() || null,
        role: 'owner',
        pinHash: pinHash(pin),
        active: true,
      },
    });
    await tx.tenantBranding.create({ data: { tenantId: t.id } });
    await tx.usageCounter.createMany({
      data: [
        { tenantId: t.id, metric: 'branches', period: 'all', value: 1 },
        { tenantId: t.id, metric: 'staff', period: 'all', value: 1 },
        { tenantId: t.id, metric: 'customers', period: 'all', value: 0 },
        { tenantId: t.id, metric: 'orders_month', period: monthKey(), value: 0 },
      ],
    });
    return t.id;
  });

  return { tenantId, ownerPin: pin };
}

/** Suspend or re-activate a tenant — mirrors status onto its subscription too. */
export async function setTenantStatus(id: string, status: 'active' | 'suspended'): Promise<void> {
  const subStatus = status === 'suspended' ? 'suspended' : 'active';
  await prisma.$transaction([
    prisma.tenant.update({ where: { id }, data: { status } }),
    prisma.subscription.updateMany({ where: { tenantId: id }, data: { status: subStatus } }),
  ]);
}

/** Hard-delete a tenant and all its data (cascade). Use with care — audited by caller. */
export async function deleteTenant(id: string): Promise<void> {
  await prisma.tenant.delete({ where: { id } });
}

export async function listTenants() {
  return prisma.tenant.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      subdomain: true,
      plan: true,
      status: true,
      createdAt: true,
      subscription: { select: { status: true, currentEnd: true, plan: { select: { name: true } } } },
      _count: { select: { outlets: true, staff: true, customers: true } },
    },
  });
}

export async function getTenantDetail(id: string) {
  return prisma.tenant.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      subdomain: true,
      plan: true,
      status: true,
      createdAt: true,
      subscription: { include: { plan: true } },
      branding: true,
      usage: true,
      _count: { select: { outlets: true, staff: true, customers: true } },
    },
  });
}
