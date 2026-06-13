'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

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
  const [tickets, setTickets] = useState<Ticket[]>(initial);
  const [station, setStation] = useState<(typeof STATIONS)[number]>('all');
  const [now, setNow] = useState(() => Date.now());
  const [connected, setConnected] = useState(false);
  const liveRef = useRef<HTMLSpanElement>(null);

  // 1s clock for the escalating timers
  useEffect(() => {
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

  async function bump(id: string) {
    // optimistic: advance/clear locally, server confirms via SSE
    setTickets((prev) =>
      prev
        .map((t) => (t.id === id ? { ...t, status: t.status === 'in_kitchen' ? 'ready' : 'served' } : t))
        .filter((t) => ACTIVE.includes(t.status)),
    );
    await fetch(`/api/orders/${id}/status`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: '{}' }).catch(() => {});
  }

  const visible = useMemo(() => {
    const list = station === 'all' ? tickets : tickets.filter((t) => t.items.some((i) => i.station === station));
    return [...list].sort((a, b) => a.placedAt - b.placedAt);
  }, [tickets, station]);

  const stats = useMemo(() => ({
    open: tickets.length,
    fresh: tickets.filter((t) => t.status === 'in_kitchen' && now - t.placedAt < 120000).length,
  }), [tickets, now]);

  return (
    <div data-skin="roast" className="kds-root">
      <div className="kds-bar">
        <div className="kds-title">
          <span ref={liveRef} className="kds-live" />
          Kitchen Display <em>· {outletName}</em>
        </div>
        <div className="kds-filter">
          {STATIONS.map((s) => (
            <button key={s} className={s === station ? 'on' : ''} onClick={() => setStation(s)}>
              {s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <div className="kds-stats">
          <span className="kstat"><b>{stats.open}</b> open</span>
          <span className="kstat"><b>{stats.fresh}</b> fresh</span>
          <span className="kstat conn" style={{ color: connected ? 'var(--ok)' : 'var(--clay)' }}>{connected ? '● live' : '○ reconnecting'}</span>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="kds-hint">
          No live tickets. Open the <b>POS</b> in another tab, send an order to the kitchen,
          and it appears here instantly. Tap a ticket to bump it.
        </div>
      ) : (
        <div className="kds-grid">
          {visible.map((t) => {
            const secs = Math.floor((now - t.placedAt) / 1000);
            const lvl = secs > 300 ? 'late' : secs > 120 ? 'warn' : 'fresh';
            const lines = station === 'all' ? t.items : t.items.filter((i) => i.station === station);
            return (
              <button key={t.id} className={`ticket ${lvl} ${t.status}`} onClick={() => bump(t.id)}>
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
                  <span className={`ti-status ${t.status}`}>{t.status === 'ready' ? 'Ready' : 'Preparing'}</span>
                  <span className="ti-bump">{t.status === 'ready' ? 'Serve ✓' : 'Bump →'}</span>
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
.kds-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(232px, 1fr)); gap: 14px; align-content: start; }
.ticket { text-align: left; background: var(--paper-2); border: 1px solid var(--line); border-top: 4px solid #56d364; border-radius: 14px; overflow: hidden; box-shadow: var(--sh-2); cursor: pointer; font-family: var(--font-body); animation: tin .3s ease both; transition: transform .12s; }
.ticket:hover { transform: translateY(-3px); }
@keyframes tin { from { opacity: 0; transform: translateY(12px); } }
.ticket.warn { border-top-color: var(--turmeric); }
.ticket.late { border-top-color: var(--clay); }
.ticket.ready { border-top-color: var(--cardamom); opacity: .92; }
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
.ti-status { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; padding: 4px 10px; border-radius: 99px; }
.ti-status.in_kitchen { background: rgba(217,138,43,.18); color: var(--turmeric-l); }
.ti-status.ready { background: rgba(86,211,100,.16); color: #6ee07c; }
.ti-bump { font-weight: 800; font-size: 13px; color: var(--turmeric); }
.kds-hint { margin: 80px auto; max-width: 460px; text-align: center; color: var(--ink-3); font-size: 14.5px; line-height: 1.6; }
.kds-hint b { color: var(--turmeric); }
`;
