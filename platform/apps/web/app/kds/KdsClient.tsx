'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { STAGES, STAGE_ORDER, stageOf, urgencyOf } from '@/lib/orderStatus';
import { LogOut } from '@/components/ui';

type Ticket = {
  id: string;
  number: number;
  table: string;
  type: string;
  status: string;
  placedAt: number;
  items: { name: string; qty: number; station: string | null; modifiers: { name: string }[] }[];
};

const STATIONS = ['all', 'kitchen', 'bar', 'dessert'] as const;
const ACTIVE = ['open', 'in_kitchen', 'ready'];

export default function KdsClient({ outletName, initial }: { outletName: string; initial: Ticket[] }) {
  const router = useRouter();
  const [tickets, setTickets] = useState<Ticket[]>(initial);
  // Petpooja-style "accept the order" step: a ticket reads as NEW until the
  // line cook acknowledges it, after which it shows as Preparing. Tickets that
  // were already past 'in_kitchen' on load are treated as accepted.
  const [acked, setAcked] = useState<Set<string>>(
    () => new Set(initial.filter((t) => t.status !== 'in_kitchen' && t.status !== 'open').map((t) => t.id)),
  );
  const [station, setStation] = useState<(typeof STATIONS)[number]>('all');
  // null until mounted, so SSR and the first client render agree (no live clock
  // during hydration → no "Text content did not match" mismatch)
  const [now, setNow] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);
  const liveRef = useRef<HTMLSpanElement>(null);

  // 1s clock for the escalating timers — starts only after mount
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // SSE subscription
  useEffect(() => {
    const es = new EventSource('/api/stream');
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'order.new') {
        // pulse the live dot
        if (liveRef.current) { liveRef.current.style.animation = 'none'; void liveRef.current.offsetWidth; liveRef.current.style.animation = ''; }
        setTickets((prev) => (prev.some((t) => t.id === msg.ticket.id) ? prev : [...prev, msg.ticket]));
      } else if (msg.type === 'order.updated') {
        setTickets((prev) => {
          const stillActive = ACTIVE.includes(msg.ticket.status);
          const without = prev.filter((t) => t.id !== msg.ticket.id);
          return stillActive ? [...without, msg.ticket] : without;
        });
      }
    };
    return () => es.close();
  }, []);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    router.replace('/login');
    router.refresh();
  }

  async function bump(id: string) {
    const t = tickets.find((x) => x.id === id);
    if (!t) return;
    const stage = stageOf(t.status, acked.has(id));

    // Stage 1 — NEW → Preparing is just an on-screen acknowledgement; the order
    // is already 'in_kitchen' on the server, so no round-trip is needed.
    if (stage === 'new') {
      setAcked((prev) => new Set(prev).add(id));
      return;
    }

    // Stage 2+ — advance the persisted lifecycle. Optimistic; SSE confirms.
    setTickets((prev) =>
      prev
        .map((x) => (x.id === id ? { ...x, status: x.status === 'in_kitchen' ? 'ready' : 'served' } : x))
        .filter((x) => ACTIVE.includes(x.status)),
    );
    await fetch(`/api/orders/${id}/status`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: '{}' }).catch(() => {});
  }

  const visible = useMemo(() => {
    const list = station === 'all' ? tickets : tickets.filter((t) => t.items.some((i) => i.station === station));
    return [...list].sort((a, b) => a.placedAt - b.placedAt);
  }, [tickets, station]);

  const stats = useMemo(() => ({
    open: tickets.length,
    new: tickets.filter((t) => stageOf(t.status, acked.has(t.id)) === 'new').length,
    ready: tickets.filter((t) => t.status === 'ready').length,
  }), [tickets, acked]);

  return (
    <div data-skin="roast" className="kds-root">
      <div className="kds-bar">
        <div className="kds-title">
          <span ref={liveRef} className="kds-live" />
          Kitchen Display <em>· {outletName}</em>
        </div>
        <div className="kds-filter" role="tablist" aria-label="Station filter">
          {STATIONS.map((s) => (
            <button key={s} role="tab" aria-selected={s === station} className={s === station ? 'on' : ''} onClick={() => setStation(s)}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <div className="kds-stats">
          <span className="kstat"><b>{stats.open}</b> open</span>
          <span className="kstat" style={{ color: STAGES.new.color }}><b style={{ color: STAGES.new.color }}>{stats.new}</b> new</span>
          <span className="kstat" style={{ color: STAGES.ready.color }}><b style={{ color: STAGES.ready.color }}>{stats.ready}</b> ready</span>
          <span className="kstat conn" style={{ color: connected ? 'var(--ok)' : 'var(--clay)' }}>{connected ? '● live' : '○ reconnecting'}</span>
          <button className="kds-logout" onClick={logout} title="Log out"><LogOut size={14} aria-hidden style={{ verticalAlign: '-2px', marginRight: 4 }} /> Log out</button>
        </div>
      </div>

      {/* colour-coded status legend (Petpooja-style key) */}
      <div className="kds-legend">
        {STAGE_ORDER.map((s) => (
          <span key={s} className="kleg">
            <span className="kleg-dot" style={{ background: STAGES[s].color }} />
            {STAGES[s].label}
          </span>
        ))}
        <span className="kleg kleg-sep">
          <span className="kleg-dot" style={{ background: 'var(--clay)' }} />
          Ageing &gt; 5 min
        </span>
      </div>

      {visible.length === 0 ? (
        <div className="kds-hint">
          No live tickets. Open the <b>POS</b> in another tab, send an order to the kitchen,
          and it appears here instantly. Tap a ticket to bump it.
        </div>
      ) : (
        <div className="kds-grid">
          {visible.map((t) => {
            // before mount `now` is null → age 0, so server & first client render match
            const age = now === null ? 0 : now - t.placedAt;
            const secs = Math.floor(age / 1000);
            const stage = stageOf(t.status, acked.has(t.id));
            const st = STAGES[stage];
            // age escalates the timer/border only while the food is still being made
            const lvl = stage === 'ready' ? 'fresh' : urgencyOf(age);
            const lines = station === 'all' ? t.items : t.items.filter((i) => i.station === station);
            return (
              <button
                key={t.id}
                className={`ticket ${lvl} stage-${stage}`}
                onClick={() => bump(t.id)}
                style={{ borderTopColor: st.color }}
              >
                <div className="ticket-top">
                  <span className="ticket-no">#{t.number}</span>
                  <span className="ticket-tbl">{t.type === 'takeaway' ? '🥡 Takeaway' : 'Table ' + t.table}</span>
                  <span className="ticket-timer">{fmt(secs)}</span>
                </div>
                <div className="ticket-items">
                  {lines.map((l, i) => (
                    <div key={i} className="ti-line">
                      <span className="ti-qty">{l.qty}×</span>
                      <span className="ti-name">{l.name}</span>
                      {l.station && <span className={`ti-stn ${l.station}`}>{l.station}</span>}
                      {l.modifiers.length > 0 && <span className="ti-mod">{l.modifiers.map((m) => m.name).join(', ')}</span>}
                    </div>
                  ))}
                </div>
                <div className="ticket-foot">
                  <span className="ti-status" style={{ background: st.bg, color: st.color }}>
                    <span className="ti-dot" style={{ background: st.color }} />
                    {st.label}
                  </span>
                  <span className="ti-bump" style={{ color: st.color }}>{st.action}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <style>{kdsCss}</style>
    </div>
  );
}

function fmt(secs: number) {
  const m = String(Math.floor(secs / 60)).padStart(2, '0');
  const s = String(secs % 60).padStart(2, '0');
  return `${m}:${s}`;
}

const kdsCss = `
.kds-root { min-height: 100vh; background: radial-gradient(120% 80% at 50% -10%, #20160F, transparent 60%), var(--paper); color: var(--ink); padding: 18px 20px; }
.kds-bar { display: flex; align-items: center; gap: 18px; margin-bottom: 18px; }
.kds-title { font-family: var(--font-display); font-size: 22px; font-weight: 700; display: flex; align-items: center; gap: 12px; }
.kds-title em { font-style: normal; color: var(--ink-3); font-size: 15px; font-family: var(--font-body); font-weight: 600; }
.kds-live { width: 11px; height: 11px; border-radius: 99px; background: #56d364; animation: kpulse 1.6s infinite; }
@keyframes kpulse { 0%{box-shadow:0 0 0 0 rgba(86,211,100,.5)} 70%{box-shadow:0 0 0 10px rgba(86,211,100,0)} 100%{box-shadow:0 0 0 0 rgba(86,211,100,0)} }
.kds-filter { display: flex; gap: 4px; background: var(--paper-2); border: 1px solid var(--line); border-radius: 999px; padding: 4px; }
.kds-filter button { padding: 8px 16px; border-radius: 999px; font-weight: 700; font-size: 13px; color: var(--ink-2); background: none; border: none; cursor: pointer; font-family: var(--font-body); }
.kds-filter button.on { background: var(--turmeric); color: #2a1607; }
.kds-stats { margin-left: auto; display: flex; gap: 16px; align-items: center; }
.kstat { font-size: 13px; color: var(--ink-3); font-weight: 600; }
.kstat b { font-family: var(--font-display); font-size: 20px; color: var(--ink); margin-right: 3px; }
.kstat.conn { font-size: 12px; font-weight: 800; }
.kds-logout { font-family: var(--font-body); font-size: 12px; font-weight: 800; color: var(--ink-2); background: var(--paper-2); border: 1px solid var(--line); border-radius: 999px; padding: 7px 14px; cursor: pointer; transition: background .12s; }
.kds-logout:hover { background: var(--paper-3); color: var(--clay); }
.kds-legend { display: flex; align-items: center; gap: 18px; margin: -6px 0 16px; padding: 9px 14px; background: var(--paper-2); border: 1px solid var(--line); border-radius: 12px; flex-wrap: wrap; }
.kleg { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 700; color: var(--ink-2); }
.kleg-dot { width: 10px; height: 10px; border-radius: 99px; }
.kleg-sep { margin-left: auto; color: var(--ink-3); }
.kds-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(232px, 1fr)); gap: 14px; align-content: start; }
.ticket { text-align: left; background: var(--paper-2); border: 1px solid var(--line); border-top: 4px solid #56d364; border-radius: 14px; overflow: hidden; box-shadow: var(--sh-2); cursor: pointer; font-family: var(--font-body); animation: tin .3s ease both; transition: transform .12s, box-shadow .2s; }
.ticket:hover { transform: translateY(-3px); }
@keyframes tin { from { opacity: 0; transform: translateY(12px); } }
/* NEW tickets pulse for attention until the kitchen accepts them */
.ticket.stage-new { animation: tin .3s ease both, newpulse 1.8s ease-in-out infinite; }
@keyframes newpulse { 0%,100% { box-shadow: var(--sh-2); } 50% { box-shadow: 0 0 0 3px rgba(59,130,246,.35), var(--sh-2); } }
.ticket.stage-served { opacity: .9; }
/* ageing cue — a red glow when a ticket is sitting too long (stage colour still owns the border) */
.ticket.late:not(.stage-ready):not(.stage-served) { box-shadow: 0 0 0 2px rgba(195,73,47,.4), var(--sh-2); }
.ticket-top { display: flex; align-items: center; gap: 8px; padding: 12px 14px; border-bottom: 1px dashed var(--line-2); }
.ticket-no { font-family: var(--font-display); font-weight: 800; font-size: 20px; }
.ticket-tbl { font-size: 12px; font-weight: 700; color: var(--ink-2); }
.ticket-timer { margin-left: auto; font-size: 17px; font-weight: 700; color: var(--ink-2); font-variant-numeric: tabular-nums; }
.ticket.warn .ticket-timer { color: var(--turmeric); }
.ticket.late .ticket-timer { color: var(--clay); }
.ticket-items { padding: 12px 14px; display: flex; flex-direction: column; gap: 9px; }
.ti-line { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.ti-qty { font-family: var(--font-display); font-weight: 800; font-size: 16px; color: var(--turmeric); }
.ti-name { font-weight: 700; font-size: 15px; }
.ti-stn { font-size: 9.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; padding: 2px 7px; border-radius: 99px; }
.ti-stn.kitchen { background: rgba(195,73,47,.18); color: var(--clay-l); }
.ti-stn.bar { background: rgba(217,169,58,.18); color: var(--gold); }
.ti-stn.dessert { background: rgba(142,59,107,.22); color: #d488b4; }
.ti-mod { width: 100%; font-size: 11.5px; color: var(--ink-3); padding-left: 24px; font-style: italic; }
.ticket-foot { display: flex; justify-content: space-between; align-items: center; padding: 11px 14px; background: var(--paper-3); border-top: 1px solid var(--line); }
.ti-status { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; padding: 4px 10px; border-radius: 99px; }
.ti-dot { width: 7px; height: 7px; border-radius: 99px; }
.ti-bump { font-weight: 800; font-size: 13px; }
.kds-hint { margin: 80px auto; max-width: 460px; text-align: center; color: var(--ink-3); font-size: 14.5px; line-height: 1.6; }
.kds-hint b { color: var(--turmeric); }
`;
