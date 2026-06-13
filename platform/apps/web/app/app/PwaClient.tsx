'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { WHEEL } from '@/lib/wheel';

type OrderDto = { id: string; number: number; status: string; type: string; table: string; placedAt: number; items: { name: string; qty: number; station: string | null }[] };
type CustomerDto = { name: string; tier: string; points: number; coins: number; visits: number; referral: string | null };
type RewardDto = { id: string; name: string; type: string; cost: number };
type Ctx = { outlet: { name: string }; table: { label: string; token: string }; order: OrderDto | null; customer: CustomerDto | null; rewards: RewardDto[]; spinsLeft: number };

const STAGES: [string, string][] = [['in_kitchen', 'In the kitchen'], ['ready', 'Ready to serve'], ['served', 'Enjoy!']];
const REW_EMOJI: Record<string, string> = { free_item: '☕', cashback: '💸', bogo: '🥐', topping: '🥛' };

export default function PwaClient({ qrToken }: { qrToken: string | null }) {
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [tab, setTab] = useState<'home' | 'play' | 'rewards'>('home');
  const [now, setNow] = useState(() => Date.now());
  const [toast, setToast] = useState<{ msg: string; emoji?: string } | null>(null);
  const [confetti, setConfetti] = useState(0);

  const qs = qrToken ? `?t=${encodeURIComponent(qrToken)}` : '';

  const load = useCallback(async () => {
    const r = await fetch(`/api/customer/context${qs}`);
    if (r.ok) setCtx(await r.json());
  }, [qs]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  // live order status via the public SSE stream
  useEffect(() => {
    const es = new EventSource(`/api/customer/stream${qs}`);
    es.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'order.new' || msg.type === 'order.updated') {
        setCtx((c) => (c ? { ...c, order: { ...(c.order ?? {}), ...msg.ticket } as OrderDto } : c));
      }
    };
    return () => es.close();
  }, [qs]);

  function flash(msg: string, emoji?: string) { setToast({ msg, emoji }); setTimeout(() => setToast(null), 2600); }
  function pop() { setConfetti((n) => n + 1); }

  if (!ctx) return <Shell><div className="grid place-items-center h-full text-ink-3">Loading your table…</div></Shell>;

  return (
    <Shell>
      <div className="pwa-screen">
        <div className="pwa-scroll">
          {tab === 'home' && <Home ctx={ctx} now={now} go={setTab} onUpsell={() => flash('Brownie added to your order!', '🍫')} />}
          {tab === 'play' && <Play ctx={ctx} qs={qs} onResult={(m, e) => { flash(m, e); pop(); }} reload={load} />}
          {tab === 'rewards' && <Rewards ctx={ctx} qs={qs} onRedeem={(m) => { flash(m, '🎁'); pop(); }} reload={load} />}
        </div>
        <nav className="pwa-nav">
          {([['home', '⌂', 'Home'], ['play', '◉', 'Play'], ['rewards', '★', 'Rewards']] as const).map(([k, i, l]) => (
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}><span>{i}</span>{l}</button>
          ))}
        </nav>
      </div>

      {toast && <div className="pwa-toast">{toast.emoji && <span>{toast.emoji}</span>}{toast.msg}</div>}
      {confetti > 0 && <Confetti key={confetti} />}
      <style>{css}</style>
    </Shell>
  );
}

/* ---------------- Home (live track + loyalty) ---------------- */
function Home({ ctx, now, go, onUpsell }: { ctx: Ctx; now: number; go: (t: 'play' | 'rewards') => void; onUpsell: () => void }) {
  const o = ctx.order;
  const curIdx = o ? Math.max(0, STAGES.findIndex((s) => s[0] === o.status)) : -1;
  const totalQty = o?.items.reduce((a, i) => a + i.qty, 0) ?? 0;
  const etaMin = Math.max(4, Math.min(12, Math.round(totalQty * 1.6) + 3));
  const elapsedMin = o ? Math.floor((now - o.placedAt) / 60000) : 0;
  const eta = Math.max(0, etaMin - elapsedMin);
  const pct = o ? ({ open: 12, in_kitchen: 55, ready: 90, served: 100 }[o.status] ?? 12) : 0;
  const c = ctx.customer;

  return (
    <>
      <header className="pwa-top">
        <div><span className="pwa-hi">Hi {c?.name ?? 'there'} 👋</span><span className="pwa-loc">{ctx.outlet.name} · {ctx.table.label}</span></div>
        {c && <span className="tier-ring"><b>{c.tier[0]?.toUpperCase()}</b></span>}
      </header>

      {o && o.status !== 'served' ? (
        <section className="track">
          <div className="track-head"><span>Your order · #{o.number}</span><span className="track-eta">{o.status === 'ready' ? 'Ready now!' : `~${eta} min`}</span></div>
          <div className="track-bar"><i style={{ width: pct + '%' }} /></div>
          <div className="track-steps">
            {STAGES.map((s, i) => (
              <div key={s[0]} className={`ts ${i <= curIdx ? 'done' : ''} ${i === curIdx ? 'cur' : ''}`}><span className="ts-dot" /><em>{s[1]}</em></div>
            ))}
          </div>
          <div className="track-items">{o.items.map((it, i) => <span key={i}>{it.qty}× {it.name}</span>)}</div>
          <button className="track-cta" onClick={() => go('play')}>⏳ Got {eta} min? <b>Play &amp; earn →</b></button>
        </section>
      ) : o && o.status === 'served' ? (
        <section className="track served"><div className="et-glyph">✅</div><p>Order #{o.number} served — enjoy!</p></section>
      ) : (
        <section className="track empty"><div className="et-glyph">📲</div><p>No live order yet.</p><span>Place one at the counter and watch it here in real time.</span></section>
      )}

      {c && (
        <section className="loyalty-snap">
          <div className="ls points"><span className="ls-n">{c.points.toLocaleString('en-IN')}</span><span className="ls-l">Points</span></div>
          <div className="ls coins"><span className="ls-n">{c.coins}</span><span className="ls-l">Coins 🪙</span></div>
          <div className="ls visits"><span className="ls-n">{c.visits}</span><span className="ls-l">Visits</span></div>
        </section>
      )}

      <section className="offer-card"><span className="of-emoji">🍫</span><div><b>Add a Brownie</b><span>₹99 · slip it in now</span></div><button onClick={onUpsell}>Add</button></section>

      <div className="quick"><button onClick={() => go('play')}><span>◉</span>Play</button><button onClick={() => go('rewards')}><span>★</span>Rewards</button></div>
    </>
  );
}

/* ---------------- Play (Spin the Wheel) ---------------- */
function Play({ ctx, qs, onResult, reload }: { ctx: Ctx; qs: string; onResult: (m: string, e: string) => void; reload: () => void }) {
  const [spinsLeft, setSpinsLeft] = useState(ctx.spinsLeft);
  const [spinning, setSpinning] = useState(false);
  const [rot, setRot] = useState(0);
  const wheelRef = useRef<SVGSVGElement>(null);

  async function spin() {
    if (spinning || spinsLeft <= 0) return;
    setSpinning(true);
    const fp = `${navigator.userAgent.slice(0, 40)}|${screen.width}x${screen.height}`;
    const r = await fetch('/api/customer/spin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ t: qs.replace('?t=', '') || undefined, fingerprint: fp }) });
    if (!r.ok) { setSpinning(false); onResult('No spins left this visit', '🙃'); return; }
    const data = await r.json();
    const n = WHEEL.length, step = 360 / n;
    const target = 360 * 5 + (360 - (data.index * step + step / 2));
    setRot(target);
    setTimeout(() => {
      const seg = data.segment;
      if (seg.kind === 'coins') onResult(`You won ${seg.value} coins!`, '🪙');
      else if (seg.kind === 'coupon') onResult(`Won a coupon: ${seg.value}!`, '🎟️');
      else onResult('So close! Try again next visit.', '🙃');
      setSpinsLeft(0); setSpinning(false); reload();
    }, 4100);
  }

  return (
    <>
      <header className="pwa-h"><h3>Play &amp; earn</h3><span>{spinsLeft > 0 ? `${spinsLeft} spin left this visit` : 'Come back next visit'}</span></header>
      <div className="wheel-wrap">
        <div className="wheel-pointer">▼</div>
        <svg ref={wheelRef} className="wheel" viewBox="0 0 200 200" style={{ transform: `rotate(${rot}deg)`, transition: rot ? 'transform 4s cubic-bezier(.17,.67,.18,1)' : 'none' }}>
          {WHEEL.map((s, i) => {
            const step = 360 / WHEEL.length;
            const a0 = ((i * step - 90) * Math.PI) / 180, a1 = (((i + 1) * step - 90) * Math.PI) / 180;
            const x0 = 100 + 100 * Math.cos(a0), y0 = 100 + 100 * Math.sin(a0);
            const x1 = 100 + 100 * Math.cos(a1), y1 = 100 + 100 * Math.sin(a1);
            const am = (a0 + a1) / 2, tx = 100 + 62 * Math.cos(am), ty = 100 + 62 * Math.sin(am);
            return (
              <g key={i}>
                <path d={`M100,100 L${x0.toFixed(1)},${y0.toFixed(1)} A100,100 0 0,1 ${x1.toFixed(1)},${y1.toFixed(1)} Z`} fill={s.color} />
                <text x={tx.toFixed(1)} y={ty.toFixed(1)} transform={`rotate(${(i * step + step / 2).toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)})`} fill="#fff" fontSize="8.5" fontWeight="700" textAnchor="middle" dominantBaseline="middle">{s.label}</text>
              </g>
            );
          })}
          <circle cx="100" cy="100" r="14" fill="#fff" stroke="#271811" strokeWidth="3" />
        </svg>
        <button className="spin-btn" onClick={spin} disabled={spinning || spinsLeft <= 0}>{spinning ? 'Spinning…' : spinsLeft > 0 ? 'SPIN' : 'No spins left'}</button>
      </div>
      <div className="play-bal"><span>🪙 {ctx.customer?.coins ?? 0} coins</span><span>★ {ctx.customer?.points.toLocaleString('en-IN') ?? 0} pts</span></div>
      <p className="anti-cheat">🔒 Server-authoritative &amp; rate-limited · 1 spin per visit, device-bound.</p>
    </>
  );
}

/* ---------------- Rewards ---------------- */
function Rewards({ ctx, qs, onRedeem, reload }: { ctx: Ctx; qs: string; onRedeem: (m: string) => void; reload: () => void }) {
  const [points, setPoints] = useState(ctx.customer?.points ?? 0);
  async function redeem(r: RewardDto) {
    if (points < r.cost) return onRedeem('Not enough points yet 🔒');
    const res = await fetch('/api/customer/redeem', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rewardId: r.id, t: qs.replace('?t=', '') || undefined }) });
    if (!res.ok) return onRedeem('Could not redeem');
    const data = await res.json();
    setPoints(data.balance.points);
    onRedeem(`Redeemed: ${r.name} (${data.coupon.code})`);
    reload();
  }
  return (
    <>
      <header className="pwa-h"><h3>Rewards wallet</h3></header>
      <div className="wallet-hero">
        <span className="wh-tier">{ctx.customer?.tier ?? 'Bronze'} member</span>
        <div className="wh-bal"><div><span>{points.toLocaleString('en-IN')}</span><em>points</em></div><div><span>{ctx.customer?.coins ?? 0}</span><em>coins</em></div></div>
      </div>
      <h4 className="rew-h">Redeem</h4>
      <div className="rew-list">
        {ctx.rewards.map((r) => (
          <div key={r.id} className="rew-card">
            <span className="rew-emoji">{REW_EMOJI[r.type] ?? '🎁'}</span>
            <div className="rew-info"><b>{r.name}</b><span>{r.type.replace('_', ' ')}</span></div>
            <button className={points < r.cost ? 'lock' : ''} onClick={() => redeem(r)}>{r.cost} pts</button>
          </div>
        ))}
      </div>
    </>
  );
}

/* ---------------- frame + fx ---------------- */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="pwa-stage">
      <div className="phone"><div className="phone-notch" />{children}</div>
      <style>{shellCss}</style>
    </main>
  );
}

function Confetti() {
  const colors = ['#E8902A', '#4E7A4A', '#C3492F', '#8E3B6B', '#D9A93A'];
  return (
    <div className="confetti">
      {Array.from({ length: 42 }).map((_, i) => {
        const a = (i / 42) * Math.PI - Math.PI / 2;
        const style = { ['--x' as string]: `${Math.cos(a) * (60 + (i % 7) * 30)}px`, ['--y' as string]: `${-140 - (i % 9) * 22}px`, ['--r' as string]: `${(i * 47) % 720 - 360}deg`, ['--d' as string]: `${0.8 + (i % 6) * 0.12}s`, background: colors[i % colors.length], borderRadius: i % 3 === 0 ? '50%' : '0' } as React.CSSProperties;
        return <i key={i} style={style} />;
      })}
    </div>
  );
}

const shellCss = `
.pwa-stage { min-height: 100vh; display: grid; place-items: center; padding: 24px; background: radial-gradient(80% 60% at 30% 10%, rgba(232,144,42,.12), transparent 60%), var(--paper); }
.phone { position: relative; width: 400px; max-width: 100%; height: 820px; max-height: 92vh; background: #120b07; border-radius: 46px; padding: 12px; box-shadow: 0 40px 90px rgba(40,20,8,.35), inset 0 0 0 2px #2a1c12; }
.phone-notch { position: absolute; top: 14px; left: 50%; transform: translateX(-50%); width: 120px; height: 26px; background: #120b07; border-radius: 0 0 16px 16px; z-index: 5; }
.pwa-screen { position: relative; height: 100%; border-radius: 36px; overflow: hidden; background: var(--paper); display: flex; flex-direction: column; }
`;

const css = `
.pwa-scroll { flex: 1; overflow-y: auto; padding: 44px 16px 80px; display: flex; flex-direction: column; gap: 16px; }
.pwa-scroll::-webkit-scrollbar { width: 0; }
.pwa-nav { position: absolute; bottom: 0; left: 0; right: 0; height: 64px; display: grid; grid-template-columns: repeat(3,1fr); background: var(--paper-3); border-top: 1px solid var(--line); }
.pwa-nav button { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; font-size: 10.5px; font-weight: 700; color: var(--ink-3); background: none; border: none; cursor: pointer; font-family: var(--font-body); }
.pwa-nav button span { font-size: 19px; }
.pwa-nav button.on { color: var(--turmeric-d); }

.pwa-top { display: flex; justify-content: space-between; align-items: center; }
.pwa-hi { display: block; font-family: var(--font-display); font-size: 22px; font-weight: 700; }
.pwa-loc { font-size: 12px; color: var(--ink-3); font-weight: 600; }
.tier-ring { width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center; background: conic-gradient(var(--gold) 70%, var(--line) 0); }
.tier-ring b { width: 34px; height: 34px; border-radius: 50%; background: var(--paper-3); display: grid; place-items: center; font-family: var(--font-display); font-weight: 800; color: var(--gold); }

.track { background: linear-gradient(160deg, color-mix(in srgb, var(--turmeric) 10%, var(--paper-3)), var(--paper-3)); border: 1px solid var(--line); border-radius: 22px; padding: 16px; box-shadow: var(--sh-2); }
.track.empty, .track.served { text-align: center; display: grid; gap: 6px; place-items: center; }
.track .et-glyph { font-size: 40px; } .track.empty p, .track.served p { font-weight: 700; } .track.empty span { font-size: 12.5px; color: var(--ink-3); }
.track-head { display: flex; justify-content: space-between; font-weight: 700; font-size: 13.5px; color: var(--ink-2); margin-bottom: 12px; }
.track-eta { color: var(--turmeric-d); }
.track-bar { height: 8px; background: var(--line); border-radius: 99px; overflow: hidden; margin-bottom: 16px; }
.track-bar i { display: block; height: 100%; border-radius: 99px; background: linear-gradient(90deg, var(--turmeric), var(--clay)); transition: width 1s; }
.track-steps { display: flex; justify-content: space-between; margin-bottom: 12px; }
.ts { display: flex; flex-direction: column; align-items: center; gap: 6px; flex: 1; }
.ts-dot { width: 14px; height: 14px; border-radius: 50%; background: var(--line); border: 2px solid var(--line-2); }
.ts.done .ts-dot { background: var(--cardamom); border-color: var(--cardamom); }
.ts.cur .ts-dot { background: var(--turmeric); border-color: var(--turmeric); box-shadow: 0 0 0 4px color-mix(in srgb, var(--turmeric) 25%, transparent); }
.ts em { font-style: normal; font-size: 9.5px; font-weight: 700; color: var(--ink-3); text-align: center; }
.ts.done em, .ts.cur em { color: var(--ink); }
.track-items { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
.track-items span { font-size: 11px; font-weight: 700; background: var(--paper); border: 1px solid var(--line); padding: 4px 9px; border-radius: 99px; color: var(--ink-2); }
.track-cta { width: 100%; padding: 12px; border-radius: 14px; background: var(--ink); color: var(--paper-2); font-weight: 700; font-size: 13.5px; border: none; cursor: pointer; font-family: var(--font-body); }
.track-cta b { color: var(--turmeric-l); }

.loyalty-snap { display: grid; grid-template-columns: repeat(3,1fr); gap: 10px; }
.ls { padding: 14px 10px; border-radius: 14px; text-align: center; border: 1px solid var(--line); background: var(--paper-3); }
.ls.points { background: color-mix(in srgb, var(--gold) 12%, var(--paper-3)); }
.ls.coins { background: color-mix(in srgb, var(--turmeric) 12%, var(--paper-3)); }
.ls-n { display: block; font-size: 22px; font-weight: 700; font-family: var(--font-display); }
.ls-l { font-size: 10.5px; font-weight: 700; color: var(--ink-3); }

.offer-card { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 14px; background: var(--paper-3); border: 1px solid var(--line); }
.of-emoji { font-size: 26px; } .offer-card b { display: block; font-size: 14px; } .offer-card div span { font-size: 11.5px; color: var(--ink-3); }
.offer-card button { margin-left: auto; padding: 9px 16px; border-radius: 99px; background: var(--turmeric); color: #2a1607; font-weight: 800; font-size: 13px; border: none; cursor: pointer; }
.quick { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.quick button { display: flex; flex-direction: column; align-items: center; gap: 5px; padding: 13px; border-radius: 14px; background: var(--ink); color: var(--paper-2); font-weight: 700; font-size: 11px; border: none; cursor: pointer; font-family: var(--font-body); }
.quick button span { font-size: 18px; color: var(--turmeric-l); }

.pwa-h h3 { font-size: 26px; } .pwa-h span { font-size: 12.5px; color: var(--ink-3); font-weight: 600; }
.wheel-wrap { display: flex; flex-direction: column; align-items: center; position: relative; }
.wheel-pointer { position: absolute; top: -6px; z-index: 4; font-size: 26px; color: var(--ink); }
.wheel { width: 250px; height: 250px; border-radius: 50%; box-shadow: 0 14px 36px rgba(40,20,8,.3), inset 0 0 0 6px #fff; }
.spin-btn { margin-top: 20px; padding: 16px 44px; border-radius: 99px; background: linear-gradient(100deg, var(--clay), var(--turmeric-d)); color: #fff; font-weight: 800; font-size: 17px; letter-spacing: .05em; border: none; cursor: pointer; box-shadow: var(--sh-3); }
.spin-btn:disabled { background: var(--line-2); color: var(--ink-3); cursor: default; box-shadow: none; }
.play-bal { display: flex; gap: 12px; justify-content: center; }
.play-bal span { font-weight: 700; font-size: 13px; background: var(--paper-3); border: 1px solid var(--line); padding: 8px 14px; border-radius: 99px; }
.anti-cheat { font-size: 11px; color: var(--ink-3); text-align: center; line-height: 1.5; }

.wallet-hero { border-radius: 22px; padding: 20px; color: #fff; background: linear-gradient(135deg, #3a2418, var(--ink)); box-shadow: var(--sh-3); }
.wh-tier { font-size: 12px; font-weight: 800; letter-spacing: .05em; color: var(--gold); text-transform: uppercase; }
.wh-bal { display: flex; gap: 28px; margin-top: 12px; }
.wh-bal span { font-size: 30px; font-weight: 800; font-family: var(--font-display); } .wh-bal em { font-style: normal; font-size: 11px; color: var(--ink-3); display: block; }
.rew-h { font-size: 16px; }
.rew-list { display: flex; flex-direction: column; gap: 10px; }
.rew-card { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 14px; background: var(--paper-3); border: 1px solid var(--line); }
.rew-emoji { font-size: 26px; } .rew-info b { display: block; font-size: 14px; } .rew-info span { font-size: 11px; color: var(--ink-3); text-transform: capitalize; }
.rew-card button { margin-left: auto; padding: 9px 14px; border-radius: 99px; background: var(--cardamom); color: #fff; font-weight: 800; font-size: 12.5px; border: none; cursor: pointer; white-space: nowrap; }
.rew-card button.lock { background: var(--line-2); color: var(--ink-3); }

.pwa-toast { position: absolute; left: 50%; bottom: 84px; transform: translateX(-50%); z-index: 60; display: flex; gap: 8px; align-items: center; background: var(--ink); color: var(--paper-2); padding: 12px 18px; border-radius: 99px; font-weight: 700; font-size: 13.5px; box-shadow: var(--sh-3); white-space: nowrap; }
.confetti { position: absolute; inset: 0; pointer-events: none; z-index: 70; display: grid; place-content: center; }
.confetti i { position: absolute; width: 9px; height: 14px; animation: cfly var(--d) cubic-bezier(.2,.7,.2,1) forwards; }
@keyframes cfly { 0% { transform: translate(0,0) rotate(0); opacity: 1; } 100% { transform: translate(var(--x), var(--y)) rotate(var(--r)); opacity: 0; } }
`;
