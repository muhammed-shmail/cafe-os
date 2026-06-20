import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getPlatformSession } from '@/lib/platform-session';
import { getTenantDetail } from '@/lib/platform-tenants';
import { TenantActions } from './TenantActions';
import { TenantSettings } from './TenantSettings';

export const dynamic = 'force-dynamic';

const fmtDate = (d: Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export default async function TenantDetail({ params }: { params: { id: string } }) {
  const s = await getPlatformSession();
  if (!s) redirect('/admin/login');
  const t = await getTenantDetail(params.id);
  if (!t) notFound();

  const sub = t.subscription;
  const usage = Object.fromEntries(t.usage.map((u) => [u.metric, u.value]));

  const so = (sub?.slotOverrides ?? {}) as Record<string, number | null | undefined>;
  const slotStr = (k: string) => (so[k] === undefined ? '' : so[k] === null ? 'unlimited' : String(so[k]));
  const brandingProps = {
    appName: t.branding?.appName ?? '',
    logoUrl: t.branding?.logoUrl ?? '',
    customDomain: t.branding?.customDomain ?? '',
    poweredBy: t.branding?.poweredBy ?? true,
  };

  const facts = [
    ['Subdomain', `${t.subdomain ?? '—'}.chayaone.com`],
    ['Plan', sub?.plan.name ?? t.plan],
    ['Subscription', sub?.status ?? '—'],
    ['Billing period', sub?.period ?? '—'],
    ['Trial ends', fmtDate(sub?.trialEndsAt)],
    ['Current period ends', fmtDate(sub?.currentEnd)],
    ['Created', fmtDate(t.createdAt)],
  ];

  const meters = [
    ['Branches', usage.branches ?? t._count.outlets, sub?.plan.maxBranches],
    ['Staff', usage.staff ?? t._count.staff, sub?.plan.maxStaff],
    ['Customers', usage.customers ?? t._count.customers, sub?.plan.maxCustomers],
  ] as const;

  return (
    <main className="min-h-screen" style={{ background: 'var(--paper)' }}>
      <header className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--line)' }}>
        <div className="flex items-center gap-3">
          <Link href="/admin/tenants" className="text-sm" style={{ color: 'var(--ink-3)' }}>← Tenants</Link>
          <div>
            <h1 className="font-display text-2xl leading-none">{t.name}</h1>
            <p className="text-xs mt-0.5 capitalize" style={{ color: 'var(--ink-3)' }}>status: {t.status}</p>
          </div>
        </div>
        <TenantActions id={t.id} status={t.status} />
      </header>

      <section className="p-6 grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <div className="lux-card p-5">
          <h2 className="font-display text-xl mb-3">Overview</h2>
          <dl className="space-y-2">
            {facts.map(([k, v]) => (
              <div key={k} className="flex justify-between text-sm">
                <dt style={{ color: 'var(--ink-3)' }}>{k}</dt>
                <dd className="font-bold capitalize">{String(v)}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="lux-card p-5">
          <h2 className="font-display text-xl mb-3">Usage vs plan</h2>
          <div className="space-y-3">
            {meters.map(([label, used, limit]) => {
              const cap = limit == null ? null : Number(limit);
              const pct = cap ? Math.min(100, Math.round((Number(used) / cap) * 100)) : 0;
              return (
                <div key={label}>
                  <div className="flex justify-between text-sm">
                    <span style={{ color: 'var(--ink-2)' }}>{label}</span>
                    <span className="font-bold">{String(used)} / {cap ?? '∞'}</span>
                  </div>
                  <div className="h-2 rounded-full mt-1" style={{ background: 'var(--paper-3)' }}>
                    <div className="h-2 rounded-full" style={{ width: `${cap ? pct : 6}%`, background: pct >= 90 ? 'var(--danger)' : 'var(--gold)' }} />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs mt-4" style={{ color: 'var(--ink-3)' }}>
            Slots are enforced at write time; blank override falls back to the plan limit.
          </p>
        </div>

        <TenantSettings
          id={t.id}
          branding={brandingProps}
          slots={{ maxBranches: slotStr('maxBranches'), maxStaff: slotStr('maxStaff'), maxCustomers: slotStr('maxCustomers') }}
        />
      </section>
    </main>
  );
}
