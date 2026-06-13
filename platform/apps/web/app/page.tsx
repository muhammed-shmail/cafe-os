import Link from 'next/link';

const surfaces = [
  { href: '/pos', glyph: '⊞', title: 'Tablet POS', desc: 'Billing, GST, KOT & payments.', live: true },
  { href: '/kds', glyph: '⊟', title: 'Kitchen Display', desc: 'Live ticket queue & timers.', live: true },
  { href: '/app', glyph: '◉', title: 'Customer PWA', desc: 'Scan, track, play, earn.', live: true },
  { href: '/dashboard', glyph: '▤', title: 'Owner Dashboard', desc: 'Analytics & AI assistants.', live: true },
];

export default function Home() {
  return (
    <main className="min-h-screen grid place-items-center p-8">
      <div className="max-w-3xl w-full">
        <p className="text-turmeric-d font-bold tracking-[0.2em] uppercase text-xs mb-4">Growth Operating System · for cafés</p>
        <h1 className="font-display text-5xl md:text-6xl leading-[0.95] mb-4">
          Cafe<span className="text-turmeric-d">OS</span>
        </h1>
        <p className="text-ink-2 text-lg mb-10 max-w-xl">
          Production app (Phase 1). The <strong>POS</strong> is wired to the database and the
          server-side GST engine. Other surfaces land next in the 3-week plan.
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          {surfaces.map((s) => {
            const inner = (
              <>
                <span className="pill absolute top-4 right-4" style={s.live ? { color: 'var(--cardamom-d)' } : undefined}>
                  {s.live ? '● live' : 'soon'}
                </span>
                <div className="text-3xl mb-3">{s.glyph}</div>
                <h3 className="text-xl mb-1">{s.title}</h3>
                <p className="text-ink-2 text-sm">{s.desc}</p>
              </>
            );
            return s.live ? (
              <Link key={s.href} href={s.href} className="card p-5 hover:-translate-y-1 transition relative">{inner}</Link>
            ) : (
              <div key={s.href} className="card p-5 relative opacity-60">{inner}</div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
