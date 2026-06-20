import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@cafeos/db';
import { getPlatformSession } from '@/lib/platform-session';
import { OpsClient } from './OpsClient';

export const dynamic = 'force-dynamic';

const ago = (d: Date) => new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export default async function OpsPage() {
  const s = await getPlatformSession();
  if (!s) redirect('/admin/login');

  const [audit, announcements, tickets] = await Promise.all([
    prisma.platformAudit.findMany({ orderBy: { createdAt: 'desc' }, take: 40, include: { admin: { select: { name: true } } } }),
    prisma.announcement.findMany({ orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.supportTicket.findMany({ orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], take: 40, include: { tenant: { select: { name: true } } } }),
  ]);

  return (
    <main className="min-h-screen" style={{ background: 'var(--paper)' }}>
      <header className="flex items-center gap-3 px-6 py-4 border-b" style={{ borderColor: 'var(--line)' }}>
        <Link href="/admin" className="text-sm" style={{ color: 'var(--ink-3)' }}>← Console</Link>
        <h1 className="font-display text-2xl leading-none">Operations</h1>
      </header>

      <section className="p-6 grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))' }}>
        <OpsClient
          announcements={announcements.map((a) => ({ id: a.id, title: a.title, audience: a.audience, published: !!a.publishedAt, createdAt: ago(a.createdAt) }))}
          tickets={tickets.map((t) => ({ id: t.id, subject: t.subject, status: t.status, priority: t.priority, tenant: t.tenant?.name ?? 'Platform', createdAt: ago(t.createdAt) }))}
        />

        <div className="lux-card p-5">
          <h2 className="font-display text-xl mb-3">Audit log</h2>
          <div className="space-y-2 max-h-[460px] overflow-auto">
            {audit.map((a) => (
              <div key={a.id} className="text-sm flex justify-between gap-3 border-b pb-2" style={{ borderColor: 'var(--line)' }}>
                <div>
                  <span className="font-bold">{a.action}</span>
                  <span style={{ color: 'var(--ink-3)' }}> · {a.admin?.name ?? 'system'}</span>
                </div>
                <span className="text-xs whitespace-nowrap" style={{ color: 'var(--ink-3)' }}>{ago(a.createdAt)}</span>
              </div>
            ))}
            {audit.length === 0 && <p className="text-sm" style={{ color: 'var(--ink-3)' }}>No actions yet.</p>}
          </div>
        </div>
      </section>
    </main>
  );
}
