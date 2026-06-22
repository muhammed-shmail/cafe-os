import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@cafeos/db';
import { getPlatformSession } from '@/lib/platform-session';
import { AdminBar } from './AdminBar';
import { AdminKpis, type AdminKpi } from './AdminKpis';

export const dynamic = 'force-dynamic';

export default async function AdminHome() {
  const s = await getPlatformSession();
  if (!s) redirect('/admin/login');

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [tenantCount, statusGroups, ordersToday, activeSubs, admin] = await Promise.all([
    prisma.tenant.count(),
    prisma.subscription.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.order.count({ where: { placedAt: { gte: startOfDay } } }),
    prisma.subscription.findMany({
      where: { status: { in: ['active', 'past_due'] } },
      select: { plan: { select: { pricePaise: true } } },
    }),
    prisma.platformAdmin.findUnique({ where: { id: s.adminId }, select: { totpEnabled: true } }),
  ]);

  const byStatus: Record<string, number> = {};
  for (const g of statusGroups) byStatus[g.status] = g._count._all;

  let mrrPaise = 0;
  for (const sub of activeSubs) {
    const pp = (sub.plan.pricePaise ?? {}) as { monthly?: number };
    mrrPaise += Number(pp.monthly ?? 0);
  }

  const kpis: AdminKpi[] = [
    { label: 'Cafes', n: tenantCount, hint: 'total tenants', kind: 'num' },
    { label: 'Active', n: byStatus.active ?? 0, hint: 'paying', kind: 'num' },
    { label: 'Trialing', n: byStatus.trialing ?? 0, hint: 'in trial', kind: 'num' },
    { label: 'Suspended', n: (byStatus.suspended ?? 0) + (byStatus.expired ?? 0), hint: 'suspended / expired', kind: 'num' },
    { label: 'MRR', n: mrrPaise, hint: 'monthly recurring', kind: 'money' },
    { label: 'ARR', n: mrrPaise * 12, hint: 'annual run-rate', kind: 'money' },
    { label: 'Orders today', n: ordersToday, hint: 'across all cafes', kind: 'num' },
  ];

  return (
    <main className="min-h-screen" style={{ background: 'var(--paper)' }}>
      <header className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--line)' }}>
        <div>
          <p className="font-display text-[12px] tracking-[0.3em] uppercase" style={{ color: 'var(--gold-d)' }}>Nuro7</p>
          <h1 className="font-display text-2xl leading-none">Platform Console</h1>
        </div>
        <AdminBar name={s.name} totpEnabled={!!admin?.totpEnabled} />
      </header>

      <section className="p-6">
        <AdminKpis kpis={kpis} />

        <Link href="/admin/tenants" className="lux-card card-glow p-6 mt-6 flex items-center justify-between" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div>
            <h2 className="font-display text-xl">Tenants →</h2>
            <p className="text-sm mt-1" style={{ color: 'var(--ink-2)' }}>
              Create cafes, manage subscriptions & slots, suspend / activate, and view usage. Every action is audited.
            </p>
          </div>
          <span className="font-display text-3xl" style={{ color: 'var(--gold-d)' }}>{tenantCount}</span>
        </Link>

        <Link href="/admin/ops" className="lux-card card-glow p-6 mt-4 flex items-center justify-between" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div>
            <h2 className="font-display text-xl">Operations →</h2>
            <p className="text-sm mt-1" style={{ color: 'var(--ink-2)' }}>
              Audit log, platform announcements, and the cross-tenant support queue.
            </p>
          </div>
          <span className="font-display text-2xl" style={{ color: 'var(--gold-d)' }}>⚙</span>
        </Link>
      </section>
    </main>
  );
}
