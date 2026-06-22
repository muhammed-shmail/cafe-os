'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { formatINR } from '@cafeos/core';
import type { TrendPoint } from '@/lib/analytics';
import { CountUp, Reveal } from '@/components/ui/motion';
import { TeaLoader } from '@/components/ui/TeaLoader';

/**
 * Revenue overview — total revenue + a date-wise sales chart and report.
 *
 * Seeds instantly from the 7-day trend already on the page, then refetches
 * `/api/dashboard/revenue?from&to` whenever the owner changes the range (presets
 * or custom from/to). Purely additive analytics — no existing data is touched.
 */
type Daily = { date: string; label: string; dateLabel: string; orders: number; grossPaise: number };
type Revenue = { from: string; to: string; totalPaise: number; orders: number; aovPaise: number; daily: Daily[] };

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const labelOf = (iso: string) => { const d = new Date(`${iso}T00:00:00`); return `${d.getDate()} ${MON[d.getMonth()]}`; };

const PRESETS: { key: string; label: string; days: number }[] = [
  { key: '7d', label: '7 days', days: 7 },
  { key: '30d', label: '30 days', days: 30 },
  { key: '90d', label: '90 days', days: 90 },
];

export function RevenuePanel({ initialTrend }: { initialTrend: TrendPoint[] }) {
  const seed = useMemo<Revenue>(() => {
    const daily: Daily[] = initialTrend.map((t) => ({ date: t.date, label: t.label, dateLabel: labelOf(t.date), orders: t.orders, grossPaise: t.grossPaise }));
    const totalPaise = daily.reduce((s, d) => s + d.grossPaise, 0);
    const orders = daily.reduce((s, d) => s + d.orders, 0);
    return { from: daily[0]?.date ?? '', to: daily[daily.length - 1]?.date ?? '', totalPaise, orders, aovPaise: orders ? Math.round(totalPaise / orders) : 0, daily };
  }, [initialTrend]);

  const today = ymd(new Date());
  const [preset, setPreset] = useState('7d');
  const [from, setFrom] = useState(seed.from || today);
  const [to, setTo] = useState(seed.to || today);
  const [data, setData] = useState<Revenue>(seed);
  const [loading, setLoading] = useState(false);
  const [showReport, setShowReport] = useState(false);

  function applyPreset(days: number, key: string) {
    const t = new Date();
    const f = new Date(t.getTime() - (days - 1) * 864e5);
    setPreset(key); setTo(ymd(t)); setFrom(ymd(f));
  }

  // refetch on range change (skip the very first render — the seed already covers 7d)
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    let alive = true;
    setLoading(true);
    fetch(`/api/dashboard/revenue?from=${from}&to=${to}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Revenue) => { if (alive) setData(d); })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [from, to]);

  return (
    <Reveal delay={0.35}>
      <section className="card card-glow p-5 flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="text-base font-bold">Revenue</h4>
            <p className="text-xs text-ink-3">Total sales and the day-by-day trend for your selected range.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {PRESETS.map((p) => {
              const on = preset === p.key;
              return (
                <button key={p.key} onClick={() => applyPreset(p.days, p.key)}
                  className="px-3 py-1.5 rounded-full text-xs font-bold transition"
                  style={on ? { background: 'var(--turmeric)', color: '#2A1607' } : { background: 'var(--paper-3)', color: 'var(--ink-2)', border: '1px solid var(--line-2)' }}>
                  {p.label}
                </button>
              );
            })}
            <span className="inline-flex items-center gap-1.5">
              <input type="date" value={from} max={to} onChange={(e) => { setFrom(e.target.value); setPreset(''); }} className="inp" style={{ minHeight: 36, width: 'auto' }} aria-label="From date" />
              <span className="text-ink-3 text-xs">→</span>
              <input type="date" value={to} min={from} max={today} onChange={(e) => { setTo(e.target.value); setPreset(''); }} className="inp" style={{ minHeight: 36, width: 'auto' }} aria-label="To date" />
            </span>
          </div>
        </div>

        {/* headline stats */}
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Total revenue" value={data.totalPaise} format={formatINR} tone />
          <Stat label="Orders" value={data.orders} format={(x) => x.toLocaleString('en-IN')} />
          <Stat label="Avg / order" value={data.aovPaise} format={formatINR} />
        </div>

        {/* chart */}
        <div className="relative">
          {loading && <div className="absolute inset-0 z-10 grid place-items-center rounded-xl" style={{ background: 'color-mix(in srgb, var(--paper-2) 70%, transparent)' }}><TeaLoader label="" size={44} /></div>}
          <RevenueChart points={data.daily} />
        </div>

        {/* date-wise report (collapsible) */}
        <div>
          <button onClick={() => setShowReport((v) => !v)} className="text-xs font-bold" style={{ color: 'var(--gold-d)' }}>
            {showReport ? '▾ Hide date-wise report' : '▸ View date-wise report'}
          </button>
          {showReport && (
            <div className="mt-3 max-h-72 overflow-auto rounded-xl border" style={{ borderColor: 'var(--line-2)' }}>
              <table className="w-full text-sm">
                <thead className="sticky top-0" style={{ background: 'var(--paper-2)' }}>
                  <tr className="text-left text-[11px] uppercase tracking-wide" style={{ color: 'var(--ink-3)' }}>
                    <th className="px-3 py-2 font-bold">Date</th>
                    <th className="px-3 py-2 font-bold text-right">Orders</th>
                    <th className="px-3 py-2 font-bold text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {[...data.daily].reverse().map((d) => (
                    <tr key={d.date} className="border-t" style={{ borderColor: 'var(--line-2)' }}>
                      <td className="px-3 py-2">{d.dateLabel} <span className="text-ink-3">· {d.label}</span></td>
                      <td className="px-3 py-2 text-right font-mono">{d.orders}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatINR(d.grossPaise)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </Reveal>
  );
}

function Stat({ label, value, format, tone }: { label: string; value: number; format: (x: number) => string; tone?: boolean }) {
  return (
    <div className="rounded-xl p-3" style={{ background: 'var(--paper-3)' }}>
      <span className="block text-[11px] mb-1 text-ink-3">{label}</span>
      <CountUp value={value} format={format} className="block text-xl md:text-2xl font-bold font-mono tnum" style={tone ? { color: 'var(--gold-d)' } : undefined} />
    </div>
  );
}

/* ---- animated SVG area chart (no chart lib) ---- */
function RevenueChart({ points }: { points: Daily[] }) {
  const reduce = useReducedMotion();
  const W = 720, H = 200, padX = 8, padTop = 14, padBottom = 26;
  const [hover, setHover] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const max = Math.max(1, ...points.map((p) => p.grossPaise));
  const n = points.length;
  const x = (i: number) => (n <= 1 ? W / 2 : padX + (i * (W - padX * 2)) / (n - 1));
  const y = (v: number) => padTop + (1 - v / max) * (H - padTop - padBottom);

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.grossPaise).toFixed(1)}`).join(' ');
  const area = n > 0 ? `${line} L ${x(n - 1).toFixed(1)} ${H - padBottom} L ${x(0).toFixed(1)} ${H - padBottom} Z` : '';

  // x labels: first, middle, last (avoid clutter)
  const labelIdx = n <= 1 ? [0] : [0, Math.floor((n - 1) / 2), n - 1];

  function onMove(e: React.PointerEvent) {
    const el = wrapRef.current; if (!el || n === 0) return;
    const rect = el.getBoundingClientRect();
    const rel = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0, bd = Infinity;
    for (let i = 0; i < n; i++) { const d = Math.abs(x(i) - rel); if (d < bd) { bd = d; best = i; } }
    setHover(best);
  }

  return (
    <div ref={wrapRef} className="relative" onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="none" style={{ display: 'block', height: 'clamp(140px, 22vw, 200px)' }}>
        <defs>
          <linearGradient id="rev-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--gold)" stopOpacity="0.34" />
            <stop offset="100%" stopColor="var(--gold)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {/* baseline */}
        <line x1={padX} y1={H - padBottom} x2={W - padX} y2={H - padBottom} stroke="var(--line-2)" strokeWidth="1" />
        {area && <motion.path d={area} fill="url(#rev-fill)" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.2 }} />}
        {line && (
          <motion.path d={line} fill="none" stroke="var(--gold-d)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"
            initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, ease: [0.25, 0.8, 0.25, 1] }} />
        )}
        {/* endpoint + hover marker */}
        {n > 0 && hover === null && <circle cx={x(n - 1)} cy={y(points[n - 1]!.grossPaise)} r="3.5" fill="var(--gold-d)" />}
        {hover !== null && points[hover] && (
          <>
            <line x1={x(hover)} y1={padTop} x2={x(hover)} y2={H - padBottom} stroke="var(--line-2)" strokeDasharray="3 3" />
            <circle cx={x(hover)} cy={y(points[hover]!.grossPaise)} r="4.5" fill="var(--gold-d)" stroke="var(--paper-2)" strokeWidth="2" />
          </>
        )}
        {labelIdx.map((i) => (
          <text key={i} x={Math.min(Math.max(x(i), 20), W - 20)} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--ink-3)">{points[i]?.dateLabel ?? ''}</text>
        ))}
      </svg>
      {hover !== null && points[hover] && (
        <div className="pointer-events-none absolute -translate-x-1/2 px-2.5 py-1.5 rounded-lg text-xs shadow"
          style={{ left: `${(x(hover) / W) * 100}%`, top: 0, background: 'var(--ink)', color: 'var(--paper-2)', whiteSpace: 'nowrap' }}>
          <b>{formatINR(points[hover]!.grossPaise)}</b> · {points[hover]!.orders} orders
          <span className="block opacity-70">{points[hover]!.dateLabel}</span>
        </div>
      )}
    </div>
  );
}
