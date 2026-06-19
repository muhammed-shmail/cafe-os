import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { canAccess, type Surface } from '@/lib/rbac';
import { ThemeToggle, AlphaTag, Table2, ChefHat, Smartphone, LayoutDashboard, type LucideIcon } from '@/components/ui';

export const dynamic = 'force-dynamic';

const surfaces: { href: string; surface: string; Icon: LucideIcon; title: string; desc: string; live: boolean }[] = [
  { href: '/pos', surface: 'pos', Icon: Table2, title: 'Tablet POS', desc: 'Billing, GST, KOT & payments.', live: true },
  { href: '/kds', surface: 'kds', Icon: ChefHat, title: 'Kitchen Display', desc: 'Live ticket queue & timers.', live: true },
  { href: '/app', surface: 'app', Icon: Smartphone, title: 'Customer PWA', desc: 'Scan, track, play, earn.', live: true },
  { href: '/dashboard', surface: 'dashboard', Icon: LayoutDashboard, title: 'Owner Dashboard', desc: 'Analytics & AI assistants.', live: true },
];

export default async function Home() {
  // when signed in, only show the surfaces this role is allowed to open
  const session = await getSession();
  const visible = surfaces.filter((s) => {
    if (!session) return true; // signed out: each page still gatekeeps to /login
    if (s.surface === 'app') return session.role === 'owner' || session.role === 'manager';
    return canAccess(session.role, s.surface as Surface);
  });

  return (
    <main className="min-h-screen grid place-items-center p-8">
      <div className="fixed top-4 right-4"><ThemeToggle /></div>
      <div className="max-w-3xl w-full">
        <p className="lux-eyebrow mb-4">Growth Operating System · for cafés</p>
        <h1 className="font-display text-6xl md:text-7xl leading-[0.92] mb-3">
          Cafe<span className="text-gold-d">OS</span>
        </h1>
        <AlphaTag className="mb-6" />
        <p className="text-ink-2 text-lg mb-10 max-w-xl leading-relaxed">
          Production app (Phase 1). The <strong>POS</strong> is wired to the database and the
          server-side GST engine. Other surfaces land next in the 3-week plan.
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          {visible.map((s) => {
            const Ic = s.Icon;
            const inner = (
              <>
                <span className={`pill absolute top-4 right-4 ${s.live ? 'pill-ok' : ''}`}>
                  {s.live ? '● live' : 'soon'}
                </span>
                <Ic size={28} className="mb-3 text-gold-d" aria-hidden strokeWidth={1.75} />
                <h3 className="text-2xl mb-1 leading-tight">{s.title}</h3>
                <p className="text-ink-2 text-sm leading-relaxed">{s.desc}</p>
              </>
            );
            return s.live ? (
              <Link key={s.href} href={s.href} className="lux-card card-hover p-6 transition relative">{inner}</Link>
            ) : (
              <div key={s.href} className="lux-card p-6 relative opacity-60">{inner}</div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
