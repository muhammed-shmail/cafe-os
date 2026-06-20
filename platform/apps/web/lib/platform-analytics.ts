import { prisma } from '@cafeos/db';

/**
 * ChayaOne — platform analytics (Phase G8). Cross-tenant aggregates for the
 * Nuro7 console: cafe counts by status, MRR/ARR (active subs × plan price),
 * orders today, and 6-month tenant growth.
 */
export async function platformStats() {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  const [tenantCount, statusGroups, ordersToday, activeSubs, recentTenants] = await Promise.all([
    prisma.tenant.count(),
    prisma.subscription.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.order.count({ where: { placedAt: { gte: startOfDay } } }),
    prisma.subscription.findMany({ where: { status: { in: ['active', 'past_due'] } }, select: { plan: { select: { pricePaise: true } } } }),
    prisma.tenant.findMany({ where: { createdAt: { gte: sixMonthsAgo } }, select: { createdAt: true } }),
  ]);

  const byStatus: Record<string, number> = {};
  for (const g of statusGroups) byStatus[g.status] = g._count._all;

  let mrrPaise = 0;
  for (const s of activeSubs) {
    const pp = (s.plan.pricePaise ?? {}) as { monthly?: number };
    mrrPaise += Number(pp.monthly ?? 0);
  }

  // tenant growth by month label, oldest → newest
  const growth: { month: string; count: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = d.toLocaleDateString('en-IN', { month: 'short' });
    const count = recentTenants.filter((t) => {
      const c = new Date(t.createdAt);
      return c.getFullYear() === d.getFullYear() && c.getMonth() === d.getMonth();
    }).length;
    growth.push({ month: label, count });
  }

  return { tenantCount, byStatus, ordersToday, mrrPaise, arrPaise: mrrPaise * 12, growth };
}
