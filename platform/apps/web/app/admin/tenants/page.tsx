import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getPlatformSession } from '@/lib/platform-session';
import { listTenants } from '@/lib/platform-tenants';
import { NewTenant } from './NewTenant';

export const dynamic = 'force-dynamic';

const STATUS_BG: Record<string, string> = {
  active: 'var(--ok-bg)',
  trialing: 'var(--info-bg)',
  suspended: 'var(--warn-bg)',
  expired: 'var(--danger-bg)',
  past_due: 'var(--warn-bg)',
  cancelled: 'var(--paper-2)',
};
const STATUS_INK: Record<string, string> = {
  active: 'var(--ok-ink)',
  trialing: 'var(--info-ink)',
  suspended: 'var(--warn-ink)',
  expired: 'var(--danger-ink)',
  past_due: 'var(--warn-ink)',
  cancelled: 'var(--ink-3)',
};

export default async function TenantsPage() {
  const s = await getPlatformSession();
  if (!s) redirect('/admin/login');
  const tenants = await listTenants();

  return (
    <main className="min-h-screen" style={{ background: 'var(--paper)' }}>
      <header className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--line)' }}>
        <div className="flex items-center gap-3">
          <Link href="/admin" className="text-sm" style={{ color: 'var(--ink-3)' }}>← Console</Link>
          <h1 className="font-display text-2xl leading-none">Tenants <span style={{ color: 'var(--ink-3)' }}>({tenants.length})</span></h1>
        </div>
        <NewTenant />
      </header>

      <section className="p-6">
        <div className="lux-card card-glow overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--paper-2)', color: 'var(--ink-3)' }} className="text-left text-xs uppercase tracking-wide">
                <th className="px-4 py-3">Cafe</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Subscription</th>
                <th className="px-4 py-3">Usage</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => {
                const st = t.subscription?.status ?? '—';
                return (
                  <tr key={t.id} className="border-t transition-colors hover:bg-[var(--paper-3)]" style={{ borderColor: 'var(--line)' }}>
                    <td className="px-4 py-3">
                      <div className="font-bold">{t.name}</div>
                      <div className="text-xs" style={{ color: 'var(--ink-3)' }}>{t.subdomain ?? '—'}.chayaone.com</div>
                    </td>
                    <td className="px-4 py-3 capitalize">{t.subscription?.plan.name ?? t.plan}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: STATUS_BG[st] ?? 'var(--paper-2)', color: STATUS_INK[st] ?? 'var(--ink-2)' }}>{st}</span>
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--ink-2)' }}>
                      {t._count.outlets} br · {t._count.staff} staff · {t._count.customers} cust
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: STATUS_BG[t.status] ?? 'var(--paper-2)', color: STATUS_INK[t.status] ?? 'var(--ink-2)' }}>{t.status}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/admin/tenants/${t.id}`} className="text-sm font-bold" style={{ color: 'var(--gold-d)' }}>Manage →</Link>
                    </td>
                  </tr>
                );
              })}
              {tenants.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center" style={{ color: 'var(--ink-3)' }}>No cafes yet — create the first one.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
