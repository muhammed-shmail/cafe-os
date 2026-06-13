'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatINR } from '@cafeos/core';
import type { DashboardData } from '@/lib/analytics';
import { SectionView, SECTION_KEY } from './Sections';

type Msg = { who: 'ai' | 'me'; html: string };

const NAV: [string, string][] = [
  ['◉', 'Overview'],
  ['📈', 'Sales & Analytics'],
  ['📦', 'Inventory'],
  ['👥', 'Staff'],
  ['🎮', 'Loyalty & Games'],
  ['📣', 'Marketing'],
  ['🤖', 'AI Assistants'],
  ['☰', 'Menu'],
  ['⚙', 'Settings'],
];

const QUAD_COLOR: Record<string, string> = {
  star: 'var(--cardamom)',
  plowhorse: 'var(--turmeric)',
  puzzle: 'var(--berry)',
  dog: 'var(--ink-3)',
};

export default function DashboardClient({
  outlet,
  staff,
  data,
}: {
  outlet: { name: string; brand: string; plan: string };
  staff: { name: string; role: string };
  data: DashboardData;
}) {
  const router = useRouter();
  const { kpi, trend, hourly, topItems, menuQuadrant, lowStock, loyalty, briefing } = data;

  // which sidebar section is showing
  const [view, setView] = useState('Overview');

  // live order/footfall counters layered on top of the server snapshot
  const [liveOrders, setLiveOrders] = useState(0);
  const [liveFootfall, setLiveFootfall] = useState(0);
  const [connected, setConnected] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [flash, setFlash] = useState(false);
  const liveDot = useRef<HTMLSpanElement>(null);

  // SSE — same per-outlet stream the KDS consumes
  useEffect(() => {
    const es = new EventSource('/api/stream');
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'order.new') {
        setLiveOrders((n) => n + 1);
        setLiveFootfall((n) => n + 1);
        setFlash(true);
        setTimeout(() => setFlash(false), 700);
        if (liveDot.current) {
          liveDot.current.style.animation = 'none';
          void liveDot.current.offsetWidth;
          liveDot.current.style.animation = '';
        }
      }
    };
    return () => es.close();
  }, []);

  // periodic pull so sales/AOV stay accurate (live counters only know order count)
  useEffect(() => {
    const t = setInterval(() => {
      setRefreshing(true);
      router.refresh();
      setLiveOrders(0);
      setLiveFootfall(0);
      setTimeout(() => setRefreshing(false), 800);
    }, 60_000);
    return () => clearInterval(t);
  }, [router]);

  const orders = kpi.todayOrders + liveOrders;
  const footfall = kpi.footfall + liveFootfall;

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    router.replace('/login');
    router.refresh();
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[248px_1fr]" style={{ background: 'var(--paper)' }}>
      <Sidebar outlet={outlet} staff={staff} active={view} onSelect={setView} onLogout={logout} />

      <main className="min-w-0 p-5 md:p-7">
        {/* header */}
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl md:text-4xl leading-tight">
              {greeting()}, {firstName(staff.name)} <span className="opacity-80">☀️</span>
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--ink-3)' }}>
              {today()} · {outlet.name}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* mobile section switcher (sidebar is hidden below lg) */}
            <select
              value={view}
              onChange={(e) => setView(e.target.value)}
              className="lg:hidden btn"
              style={{ padding: '8px 12px' }}
              aria-label="Section"
            >
              {NAV.map(([, label]) => (
                <option key={label} value={label}>{label}</option>
              ))}
            </select>
            <span className="pill" style={{ color: connected ? 'var(--cardamom-d)' : 'var(--ink-3)' }}>
              <span
                ref={liveDot}
                className="inline-block w-2 h-2 rounded-full"
                style={{ background: connected ? 'var(--cardamom)' : 'var(--ink-3)', animation: 'pulse 2s infinite' }}
              />
              {connected ? 'Live' : 'Reconnecting'}
            </span>
            <button
              onClick={() => {
                setRefreshing(true);
                router.refresh();
                setLiveOrders(0);
                setLiveFootfall(0);
                setTimeout(() => setRefreshing(false), 800);
              }}
              className="btn"
              style={{ padding: '8px 14px' }}
            >
              <span style={{ display: 'inline-block', animation: refreshing ? 'spin 0.8s linear' : 'none' }}>↻</span> Refresh
            </button>
          </div>
        </header>

        {/* ── deep sections (lazy-loaded from /api/dashboard/section) ── */}
        {view !== 'Overview' && view !== 'AI Assistants' && SECTION_KEY[view] && (
          <SectionView section={SECTION_KEY[view]!} title={view} />
        )}

        {/* AI Assistants — the grounded sales assistant, full width */}
        {view === 'AI Assistants' && (
          <div className="grid gap-4">
            <h2 className="font-display text-2xl md:text-3xl">AI Assistants</h2>
            <Assistant kpi={kpi} />
          </div>
        )}

        {/* bento — Overview */}
        {view === 'Overview' && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* AI briefing */}
          <section className="card col-span-2 p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="font-bold text-sm" style={{ color: 'var(--berry)' }}>✦ AI Morning Briefing</span>
              <span className="text-xs" style={{ color: 'var(--ink-3)' }}>grounded in live data</span>
            </div>
            <div className="grid gap-2.5">
              {briefing.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--ink-3)' }}>Nothing to flag yet — insights appear as orders come in.</p>
              ) : (
                briefing.map((b, i) => <BriefRow key={i} brief={b} />)
              )}
            </div>
          </section>

          {/* KPIs */}
          <Kpi label="Today’s sales" value={formatINR(kpi.todaySalesPaise)} delta={deltaLabel(kpi.salesDeltaPct, 'vs yesterday')} flash={flash} mono />
          <Kpi label="Orders" value={String(orders)} delta={liveOrders > 0 ? `▲ ${liveOrders} live now` : deltaLabel(kpi.ordersDeltaPct, 'vs yesterday')} flash={flash} mono />
          <Kpi label="Avg order value" value={formatINR(kpi.aovPaise)} delta={orders > 0 ? 'per settled order' : '—'} mono />
          <Kpi label="Footfall" value={String(footfall)} delta={`QR scans ${loyalty.qrScanPct}%`} mono />

          {/* sales chart */}
          <section className="card col-span-2 p-5">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-base font-bold">Orders · last 7 days</h4>
              <span className="text-xs" style={{ color: 'var(--ink-3)' }}>{trendSummary(trend)}</span>
            </div>
            <BarChart trend={trend} />
          </section>

          {/* hourly heatmap */}
          <section className="card col-span-2 p-5">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-base font-bold">Hour-of-day heatmap</h4>
              <span className="text-xs" style={{ color: 'var(--ink-3)' }}>last 7 days</span>
            </div>
            <Heatmap hourly={hourly} />
          </section>

          {/* inventory alerts */}
          <section className="card col-span-2 p-5">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-base font-bold">⚠ Inventory alerts</h4>
              {lowStock.length > 0 && <span className="text-xs font-bold" style={{ color: 'var(--clay)' }}>Reorder all →</span>}
            </div>
            {lowStock.length === 0 ? (
              <Empty>Stock is healthy — nothing below reorder level.</Empty>
            ) : (
              <div className="grid gap-1.5">
                {lowStock.map((s) => (
                  <div key={s.id} className="flex items-center gap-2.5 py-1.5 px-2 rounded-lg" style={{ background: 'var(--paper-3)' }}>
                    <span className="w-2 h-2 rounded-full" style={{ background: s.level === 'critical' ? 'var(--clay)' : 'var(--gold)' }} />
                    <b className="text-sm flex-1">{s.name}</b>
                    <span className="text-sm tnum" style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-2)' }}>{s.qty}</span>
                    <span className="pill text-[10px]" style={{ color: s.level === 'critical' ? 'var(--clay)' : 'var(--ink-2)' }}>{s.level}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* menu engineering quadrant */}
          <section className="card col-span-2 p-5">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-base font-bold">Menu engineering</h4>
              <span className="text-xs" style={{ color: 'var(--ink-3)' }}>popularity × margin</span>
            </div>
            <Quadrant dots={menuQuadrant} />
          </section>

          {/* AI assistant */}
          <Assistant kpi={kpi} />

          {/* loyalty snapshot */}
          <section className="card col-span-2 p-5">
            <h4 className="text-base font-bold mb-4">🎮 Engagement engine</h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Stat n={`${loyalty.qrScanPct}%`} label="QR scan rate" />
              <Stat n={`${loyalty.repeatPct}%`} label="repeat visitors" />
              <Stat n={String(loyalty.gamesPlayed)} label="games played" />
              <Stat n={compactPoints(loyalty.pointsLiability)} label="point liability" />
            </div>
          </section>
        </div>
        )}
      </main>
    </div>
  );
}

/* --------------------------- sidebar --------------------------- */
function Sidebar({
  outlet,
  staff,
  active,
  onSelect,
  onLogout,
}: {
  outlet: { name: string; brand: string; plan: string };
  staff: { name: string; role: string };
  active: string;
  onSelect: (label: string) => void;
  onLogout: () => void;
}) {
  return (
    <aside className="hidden lg:flex flex-col gap-1 p-4 border-r" style={{ borderColor: 'var(--line)', background: 'var(--paper-2)' }}>
      <div className="flex items-center gap-2.5 px-2 py-3 mb-2">
        <span style={{ fontSize: 22, color: 'var(--turmeric-d)' }}>◐</span>
        <div className="leading-tight">
          <b className="block text-sm">{outlet.brand}</b>
          <span className="text-xs capitalize" style={{ color: 'var(--ink-3)' }}>{staff.role}</span>
        </div>
      </div>

      <nav className="flex flex-col gap-0.5 flex-1">
        {NAV.map(([icon, label]) => {
          const on = active === label;
          return (
            <button
              key={label}
              onClick={() => onSelect(label)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-left transition"
              style={on
                ? { background: 'var(--turmeric)', color: '#2A1607', fontWeight: 700 }
                : { color: 'var(--ink-2)' }}
            >
              <span style={{ width: 18, textAlign: 'center' }}>{icon}</span>
              {label}
              {label === 'Overview' && <span className="ml-auto text-[10px] opacity-70">live</span>}
            </button>
          );
        })}
      </nav>

      <Link href="/pos" className="flex items-center gap-2 px-3 py-2 text-sm rounded-xl transition" style={{ color: 'var(--ink-2)' }}>
        ⊞ Open POS
      </Link>

      <div className="card p-3 mt-1" style={{ background: 'var(--paper-3)' }}>
        <b className="text-sm capitalize">{outlet.plan} plan</b>
        <span className="block text-xs mb-2" style={{ color: 'var(--ink-3)' }}>14 days left in trial</span>
        <button className="btn btn-primary w-full" style={{ padding: '8px' }}>Upgrade</button>
      </div>

      <button onClick={onLogout} className="px-3 py-2 mt-1 text-sm text-left rounded-xl transition" style={{ color: 'var(--ink-3)' }}>
        ⏻ Log out
      </button>

      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </aside>
  );
}

/* --------------------------- KPI card --------------------------- */
function Kpi({ label, value, delta, flash, mono }: { label: string; value: string; delta: string; flash?: boolean; mono?: boolean }) {
  const up = delta.startsWith('▲');
  const down = delta.startsWith('▼');
  return (
    <section className="card p-4 relative overflow-hidden transition" style={flash ? { boxShadow: 'var(--sh-glow)' } : undefined}>
      <span className="block text-xs mb-2" style={{ color: 'var(--ink-3)' }}>{label}</span>
      <span className="block text-2xl md:text-3xl font-bold tnum" style={mono ? { fontFamily: 'var(--font-mono)' } : undefined}>{value}</span>
      <span className="block text-xs mt-1.5 font-semibold" style={{ color: up ? 'var(--cardamom-d)' : down ? 'var(--clay)' : 'var(--ink-3)' }}>{delta}</span>
    </section>
  );
}

/* --------------------------- briefing row --------------------------- */
function BriefRow({ brief }: { brief: DashboardData['briefing'][number] }) {
  const tone = brief.tone;
  const accent = tone === 'up' ? 'var(--cardamom)' : tone === 'warn' ? 'var(--clay)' : 'var(--berry)';
  const glyph = tone === 'up' ? '▲' : tone === 'warn' ? '!' : '✦';
  return (
    <div className="flex items-start gap-3 p-3 rounded-xl" style={{ background: 'var(--paper-3)', borderLeft: `3px solid ${accent}` }}>
      <span className="grid place-items-center w-6 h-6 rounded-full text-xs font-bold shrink-0" style={{ background: accent, color: '#fff' }}>{glyph}</span>
      <p className="text-sm flex-1" style={{ color: 'var(--ink-2)' }}>{brief.text}</p>
      <button className="text-xs font-bold whitespace-nowrap shrink-0" style={{ color: accent }}>{brief.action} →</button>
    </div>
  );
}

/* --------------------------- bar chart --------------------------- */
function BarChart({ trend }: { trend: DashboardData['trend'] }) {
  const max = Math.max(...trend.map((t) => t.orders), 1);
  return (
    <div className="flex items-end justify-between gap-2 h-40">
      {trend.map((t, i) => (
        <div key={i} className="flex-1 flex flex-col items-center justify-end h-full gap-1.5">
          <div className="relative w-full flex items-end justify-center" style={{ height: '100%' }}>
            <div
              className="w-full max-w-[34px] rounded-t-md transition-all relative group"
              style={{ height: `${(t.orders / max) * 100}%`, minHeight: t.orders > 0 ? 6 : 2, background: i === trend.length - 1 ? 'var(--turmeric)' : 'var(--turmeric-l)' }}
              title={`${t.orders} orders · ${formatINR(t.grossPaise)}`}
            >
              <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[11px] font-bold tnum" style={{ color: 'var(--ink-2)' }}>
                {t.orders || ''}
              </span>
            </div>
          </div>
          <em className="text-[11px] not-italic" style={{ color: 'var(--ink-3)' }}>{t.label}</em>
        </div>
      ))}
    </div>
  );
}

/* --------------------------- heatmap --------------------------- */
function Heatmap({ hourly }: { hourly: number[] }) {
  const max = Math.max(...hourly, 1);
  return (
    <div>
      <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(24, 1fr)' }}>
        {hourly.map((v, h) => (
          <span
            key={h}
            className="rounded-sm"
            style={{
              aspectRatio: '1',
              background: v === 0 ? 'var(--paper-3)' : `color-mix(in srgb, var(--turmeric) ${20 + (v / max) * 80}%, transparent)`,
              border: '1px solid var(--line)',
            }}
            title={`${fmtHour(h)} · ${v} order${v === 1 ? '' : 's'}`}
          />
        ))}
      </div>
      <div className="flex justify-between mt-2 text-[10px]" style={{ color: 'var(--ink-3)' }}>
        <span>12a</span><span>6a</span><span>12p</span><span>6p</span><span>11p</span>
      </div>
    </div>
  );
}

/* --------------------------- menu quadrant --------------------------- */
function Quadrant({ dots }: { dots: DashboardData['menuQuadrant'] }) {
  if (dots.length === 0)
    return <div className="h-56 grid place-items-center"><Empty>Not enough sales yet to map the menu.</Empty></div>;
  return (
    <div className="relative h-56 rounded-xl" style={{ background: 'var(--paper-3)', border: '1px solid var(--line)' }}>
      {/* crosshair */}
      <div className="absolute inset-x-0 top-1/2 border-t border-dashed" style={{ borderColor: 'var(--line-2)' }} />
      <div className="absolute inset-y-0 left-1/2 border-l border-dashed" style={{ borderColor: 'var(--line-2)' }} />
      {/* labels */}
      <span className="absolute top-1.5 left-2 text-[10px] font-bold" style={{ color: 'var(--ink-3)' }}>Puzzles</span>
      <span className="absolute top-1.5 right-2 text-[10px] font-bold" style={{ color: 'var(--cardamom-d)' }}>⭐ Stars</span>
      <span className="absolute bottom-1.5 left-2 text-[10px] font-bold" style={{ color: 'var(--ink-3)' }}>Dogs</span>
      <span className="absolute bottom-1.5 right-2 text-[10px] font-bold" style={{ color: 'var(--ink-3)' }}>Plowhorses</span>
      {dots.map((d) => (
        <span
          key={d.itemId}
          className="absolute group"
          style={{ left: `${d.pop}%`, bottom: `${d.profit}%`, transform: 'translate(-50%, 50%)' }}
        >
          <span className="block w-2.5 h-2.5 rounded-full ring-2 ring-white/60" style={{ background: QUAD_COLOR[d.quad] }} />
          <em className="absolute left-3 top-1/2 -translate-y-1/2 whitespace-nowrap text-[10px] not-italic opacity-0 group-hover:opacity-100 transition pointer-events-none px-1.5 py-0.5 rounded" style={{ background: 'var(--ink)', color: 'var(--paper-2)' }}>
            {d.name} · {d.qty} sold
          </em>
        </span>
      ))}
    </div>
  );
}

/* --------------------------- AI assistant --------------------------- */
function Assistant({ kpi }: { kpi: DashboardData['kpi'] }) {
  const [msgs, setMsgs] = useState<Msg[]>([
    { who: 'ai', html: 'Ask me anything — “why are sales down?”, “what should I promote tonight?”, “who should I win back?”' },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scroll = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroll.current?.scrollTo({ top: scroll.current.scrollHeight, behavior: 'smooth' });
  }, [msgs, busy]);

  async function ask(q: string) {
    if (!q.trim() || busy) return;
    setMsgs((m) => [...m, { who: 'me', html: escapeHtml(q) }]);
    setInput('');
    setBusy(true);
    try {
      const res = await fetch('/api/dashboard/assistant', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ q }),
      });
      const { reply } = await res.json();
      setMsgs((m) => [...m, { who: 'ai', html: reply ?? 'Sorry, I couldn’t read that.' }]);
    } catch {
      setMsgs((m) => [...m, { who: 'ai', html: 'Network hiccup — try again in a moment.' }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card col-span-2 p-5 flex flex-col" style={{ minHeight: 320 }}>
      <div className="flex items-center justify-between mb-3">
        <span className="font-bold text-sm" style={{ color: 'var(--berry)' }}>🤖 Sales Assistant</span>
        <span className="text-xs" style={{ color: 'var(--ink-3)' }}>grounded in your numbers</span>
      </div>

      <div ref={scroll} className="flex-1 overflow-y-auto flex flex-col gap-2.5 mb-3 pr-1" style={{ maxHeight: 220 }}>
        {msgs.map((m, i) => (
          <div
            key={i}
            className="text-sm px-3 py-2 rounded-2xl max-w-[88%]"
            style={m.who === 'me'
              ? { alignSelf: 'flex-end', background: 'var(--turmeric)', color: '#2A1607', fontWeight: 600 }
              : { alignSelf: 'flex-start', background: 'var(--paper-3)', color: 'var(--ink-2)', border: '1px solid var(--line)' }}
            dangerouslySetInnerHTML={{ __html: m.html }}
          />
        ))}
        {busy && (
          <div className="text-sm px-3 py-2.5 rounded-2xl self-start flex gap-1" style={{ background: 'var(--paper-3)', border: '1px solid var(--line)' }}>
            <Dot /><Dot delay={0.15} /><Dot delay={0.3} />
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 mb-2.5">
        {['Why up today?', 'Promote tonight?', 'Who to win back?', 'Busiest hours?'].map((q) => (
          <button key={q} onClick={() => ask(q)} disabled={busy} className="pill text-xs disabled:opacity-50 hover:-translate-y-0.5 transition">{q}</button>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && ask(input)}
          placeholder="Ask the assistant…"
          className="flex-1 px-3 py-2.5 rounded-xl text-sm outline-none"
          style={{ background: 'var(--paper-3)', border: '1px solid var(--line-2)', color: 'var(--ink)' }}
        />
        <button onClick={() => ask(input)} disabled={busy || !input.trim()} className="btn btn-dark" style={{ padding: '0 16px' }}>↑</button>
      </div>

      <style>{`@keyframes blink{0%,80%,100%{opacity:.25}40%{opacity:1}}`}</style>
    </section>
  );
}

function Dot({ delay = 0 }: { delay?: number }) {
  return <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--ink-3)', animation: `blink 1.2s ${delay}s infinite` }} />;
}

/* --------------------------- small bits --------------------------- */
function Stat({ n, label }: { n: string; label: string }) {
  return (
    <div>
      <span className="block text-2xl font-bold tnum" style={{ fontFamily: 'var(--font-mono)', color: 'var(--turmeric-d)' }}>{n}</span>
      <em className="text-xs not-italic" style={{ color: 'var(--ink-3)' }}>{label}</em>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm" style={{ color: 'var(--ink-3)' }}>{children}</p>;
}

/* --------------------------- pure helpers --------------------------- */
function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}
const firstName = (n: string) => n.replace(/\s*\(.*?\)\s*/g, '').trim().split(' ')[0] || n;
function today() {
  return new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
}
function deltaLabel(pct: number | null, suffix: string) {
  if (pct == null) return '—';
  if (pct === 0) return `flat ${suffix}`;
  return `${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}% ${suffix}`;
}
function trendSummary(trend: DashboardData['trend']) {
  const total = trend.reduce((s, t) => s + t.orders, 0);
  return total === 0 ? 'no orders yet' : `${total} orders this week`;
}
const fmtHour = (h: number) => (h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`);
function compactPoints(p: number) {
  if (p >= 100000) return `${(p / 100000).toFixed(1)}L`;
  if (p >= 1000) return `${(p / 1000).toFixed(1)}k`;
  return String(p);
}
const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
