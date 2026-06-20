import { prisma } from '@cafeos/db';

/**
 * ChayaOne — slot / quota enforcement (Phase G6).
 *
 * Effective limit(metric) = slotOverrides[metric] ?? plan[metric]   (null ⇒ unlimited)
 * Usage(metric)           = UsageCounter[tenant, metric, period]
 * Allowed                 = limit === null || usage < limit
 *
 * `assertSlot` is called at the few write paths that consume a slot; `bumpUsage`
 * increments the cheap meter alongside the entity create. A nightly reconciler
 * (future) can recompute counters from source if they ever drift.
 */
export type Metric = 'branches' | 'staff' | 'customers' | 'orders_month' | 'storage_mb';

export class SlotExceeded extends Error {
  constructor(public readonly metric: Metric, public readonly limit: number) {
    super(`slot_exceeded:${metric}`);
    this.name = 'SlotExceeded';
  }
}

const PLAN_FIELD: Record<Metric, 'maxBranches' | 'maxStaff' | 'maxCustomers' | 'maxOrdersMonthly' | 'storageMb'> = {
  branches: 'maxBranches',
  staff: 'maxStaff',
  customers: 'maxCustomers',
  orders_month: 'maxOrdersMonthly',
  storage_mb: 'storageMb',
};

const monthKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const periodFor = (m: Metric) => (m === 'orders_month' ? monthKey() : 'all');

/** Effective limit for a metric (override → plan → null=unlimited). */
export async function getLimit(tenantId: string, metric: Metric): Promise<number | null> {
  const sub = await prisma.subscription.findUnique({
    where: { tenantId },
    select: {
      slotOverrides: true,
      plan: { select: { maxBranches: true, maxStaff: true, maxCustomers: true, maxOrdersMonthly: true, storageMb: true } },
    },
  });
  if (!sub) return null; // no subscription ⇒ treat as unmetered (shouldn't happen in prod)
  const overrides = (sub.slotOverrides ?? {}) as Record<string, number | null | undefined>;
  const field = PLAN_FIELD[metric];
  const ov = overrides[field];
  if (ov !== undefined) return ov;
  return sub.plan[field];
}

export async function getUsage(tenantId: string, metric: Metric): Promise<number> {
  const row = await prisma.usageCounter.findUnique({
    where: { tenantId_metric_period: { tenantId, metric, period: periodFor(metric) } },
    select: { value: true },
  });
  return row?.value ?? 0;
}

/** Throw SlotExceeded if the tenant is at/over its limit for `metric`. */
export async function assertSlot(tenantId: string, metric: Metric): Promise<void> {
  const limit = await getLimit(tenantId, metric);
  if (limit === null) return; // unlimited
  const used = await getUsage(tenantId, metric);
  if (used >= limit) throw new SlotExceeded(metric, limit);
}

/** Increment (or decrement) a usage meter; upserts the row. */
export async function bumpUsage(tenantId: string, metric: Metric, delta = 1): Promise<void> {
  const period = periodFor(metric);
  await prisma.usageCounter.upsert({
    where: { tenantId_metric_period: { tenantId, metric, period } },
    create: { tenantId, metric, period, value: delta > 0 ? delta : 0 },
    update: { value: { increment: delta } },
  });
}

/** Owner/admin usage snapshot across all metrics. */
export async function usageSummary(tenantId: string): Promise<Record<Metric, { used: number; limit: number | null }>> {
  const metrics: Metric[] = ['branches', 'staff', 'customers', 'orders_month', 'storage_mb'];
  const entries = await Promise.all(
    metrics.map(async (m) => [m, { used: await getUsage(tenantId, m), limit: await getLimit(tenantId, m) }] as const),
  );
  return Object.fromEntries(entries) as Record<Metric, { used: number; limit: number | null }>;
}
