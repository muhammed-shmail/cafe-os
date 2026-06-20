'use client';

import { useCallback, useEffect, useState } from 'react';
import { GamesHub } from '@/components/games/GamesHub';
import { BrandMark } from '@/components/BrandMark';
import { Coffee, ShoppingCart, Gamepad2, Gift, Plus, Minus, AlphaTag, type LucideIcon } from '@/components/ui';

const NAV: { key: 'home' | 'order' | 'play' | 'rewards'; icon: LucideIcon; label: string }[] = [
  { key: 'home', icon: Coffee, label: 'Home' },
  { key: 'order', icon: ShoppingCart, label: 'Order' },
  { key: 'play', icon: Gamepad2, label: 'Play' },
  { key: 'rewards', icon: Gift, label: 'Rewards' },
];

type OrderDto = { id: string; number: number; status: string; type: string; table: string; placedAt: number; items: { name: string; qty: number; station: string | null }[] };
type CustomerDto = { name: string; tier: string; points: number; coins: number; visits: number; referral: string | null; registered?: boolean };
type RewardDto = { id: string; name: string; type: string; cost: number };
type MenuItemDto = { id: string; name: string; pricePaise: number; tags: string[] };
type MenuCatDto = { id: string; name: string; items: MenuItemDto[] };
type PwaFeatured = { id: string; name: string; pricePaise: number; imageUrl: string | null; label: string | null };
type PwaBanner = { id: string; imageUrl: string; title: string; link: string | null };
type WalletBlock = { enabled: boolean; points: number; balancePaise: number; redeemablePaise: number; pointsPerRupee: number; minPointsToRedeem: number; maxRedeemPctOfBill: number };
type LoyaltyBlock = { orders: number; spendPaise: number; points: number; gamesPlayed: number; rewardsWon: number; tier: string; tierName: string; nextTierName: string | null; nextAtSpendPaise: number | null };
type PwaBlock = {
  registration: { enabled: boolean; collectName: boolean };
  theme: { accent: string | null; logoUrl: string | null; heroTagline: string };
  home: { sections: string[] };
  welcome: string;
  manualPick: boolean;
  featured: PwaFeatured[];
  banners: PwaBanner[];
  gameUnlock?: { unlocked: boolean; minOrderPaise: number; orderTotalPaise: number };
  wallet?: WalletBlock;
  loyalty?: LoyaltyBlock;
};
type Ctx = { outlet: { name: string }; table: { label: string; token: string }; order: OrderDto | null; customer: CustomerDto | null; rewards: RewardDto[]; menu: MenuCatDto[]; spinsLeft: number; pwa?: PwaBlock };

const FEAT_LABEL: Record<string, string> = { best_seller: 'Best Seller', chef_special: 'Chef Special', new_arrival: 'New Arrival', trending: 'Trending' };

// QR order lifecycle as the guest sees it (approval-gated front step)
const STAGES: [string, string][] = [['pending_approval', 'Confirming'], ['in_kitchen', 'In the kitchen'], ['ready', 'Ready to serve'], ['served', 'Enjoy!']];
const STAGE_IDX: Record<string, number> = { pending_approval: 0, approved: 1, open: 1, in_kitchen: 1, ready: 2, served: 3 };
const REW_EMOJI: Record<string, string> = { free_item: '☕', cashback: '💸', bogo: '🥐', topping: '🥛' };
const rupee = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`;

export default function PwaClient({ qrToken }: { qrToken: string | null }) {
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [tab, setTab] = useState<'home' | 'order' | 'play' | 'rewards'>('home');
  const [now, setNow] = useState(() => Date.now());
  const [toast, setToast] = useState<{ msg: string; emoji?: string } | null>(null);
  const [confetti, setConfetti] = useState(0);
  const [cart, setCart] = useState<Record<string, number>>({}); // itemId -> qty
  const [entered, setEntered] = useState(false); // QR welcome shown until "Start Ordering"

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
      if (msg.type === 'order.new' || msg.type === 'order.updated' || msg.type === 'order.pending') {
        setCtx((c) => (c ? { ...c, order: { ...(c.order ?? {}), ...msg.ticket } as OrderDto } : c));
      }
    };
    return () => es.close();
  }, [qs]);

  // register the installable PWA's service worker (production only — keeps dev clean)
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  // QR welcome shows once per table session, then "Start Ordering" enters the app
  useEffect(() => {
    try { if (sessionStorage.getItem(`cw_entered_${qrToken ?? 'none'}`) === '1') setEntered(true); } catch {}
  }, [qrToken]);
  const startOrdering = useCallback(() => {
    try { sessionStorage.setItem(`cw_entered_${qrToken ?? 'none'}`, '1'); } catch {}
    setEntered(true);
  }, [qrToken]);

  function flash(msg: string, emoji?: string) { setToast({ msg, emoji }); setTimeout(() => setToast(null), 2600); }
  function pop() { setConfetti((n) => n + 1); }

  if (!ctx) return (
    <Shell>
      <div className="pwa-load">
        <BrandMark size={184} />
        <AlphaTag />
        <p className="pwa-load-cap">Brewing your table…</p>
        <span className="pwa-load-steam" aria-hidden="true"><i /><i /><i /></span>
      </div>
      <style>{loadCss}</style>
    </Shell>
  );

  // QR welcome / landing — cafe + table + offers, then "Start Ordering" enters.
  if (!entered) {
    return (
      <Shell>
        <Welcome ctx={ctx} onStart={startOrdering} />
        <style>{css}</style>
      </Shell>
    );
  }

  // Registration gate — only when the owner requires it and this device isn't
  // recognised yet. When disabled, this never shows (current behaviour).
  if (ctx.pwa?.registration.enabled && !ctx.customer?.registered) {
    return (
      <Shell>
        <Register cfg={ctx.pwa.registration} outlet={ctx.outlet.name} welcome={ctx.pwa.welcome} qrToken={qrToken} onDone={load} />
        <style>{css}</style>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="pwa-screen">
        <div className="pwa-scroll">
          {tab === 'home' && <Home ctx={ctx} now={now} go={setTab} onUpsell={() => setTab('order')} onPick={(id) => { setCart((c) => ({ ...c, [id]: (c[id] ?? 0) + 1 })); setTab('order'); }} />}
          {tab === 'order' && <Order ctx={ctx} qs={qs} cart={cart} setCart={setCart} reload={load} onPlaced={() => { flash('Order sent to waiter for confirmation', '⏳'); setTab('home'); }} />}
          {tab === 'play' && <GamesHub ctx={ctx} qs={qs} onResult={(m, e) => { flash(m, e); pop(); }} reload={load} />}
          {tab === 'rewards' && <Rewards ctx={ctx} qs={qs} onRedeem={(m) => { flash(m, '🎁'); pop(); }} reload={load} />}
        </div>
        <nav className="pwa-nav" aria-label="Primary">
          {NAV.map(({ key: k, icon: Ic, label: l }) => {
            const count = k === 'order' ? Object.values(cart).reduce((a, b) => a + b, 0) : 0;
            const on = tab === k;
            return (
              <button key={k} className={on ? 'on' : ''} onClick={() => setTab(k)} aria-current={on ? 'page' : undefined} aria-label={count > 0 ? `${l}, ${count} in cart` : l}>
                <span><Ic size={20} aria-hidden /></span>{l}
                {count > 0 && <i className="nav-badge">{count}</i>}
              </button>
            );
          })}
        </nav>
      </div>

      {toast && <div className="pwa-toast" role="status" aria-live="polite">{toast.emoji && <span aria-hidden>{toast.emoji}</span>}{toast.msg}</div>}
      {confetti > 0 && <Confetti key={confetti} />}
      <style>{css}</style>
    </Shell>
  );
}

/* ---------------- Home (live track + loyalty + featured + banners) ---------------- */
function Home({ ctx, now, go, onUpsell, onPick }: { ctx: Ctx; now: number; go: (t: 'order' | 'play' | 'rewards') => void; onUpsell: () => void; onPick: (id: string) => void }) {
  const o = ctx.order;
  const pending = o?.status === 'pending_approval';
  const curIdx = o ? (STAGE_IDX[o.status] ?? 0) : -1;
  const totalQty = o?.items.reduce((a, i) => a + i.qty, 0) ?? 0;
  const etaMin = Math.max(4, Math.min(12, Math.round(totalQty * 1.6) + 3));
  const elapsedMin = o ? Math.floor((now - o.placedAt) / 60000) : 0;
  const eta = Math.max(0, etaMin - elapsedMin);
  const pct = o ? ({ pending_approval: 8, approved: 32, open: 32, in_kitchen: 58, ready: 90, served: 100 }[o.status] ?? 8) : 0;
  const c = ctx.customer;
  const pwa = ctx.pwa;
  const [pickOpen, setPickOpen] = useState(false);

  const trackBlock = o && o.status === 'cancelled' ? (
    <section className="track empty"><div className="et-glyph">🚫</div><p>Order #{o.number} was not confirmed</p><span>Please check with a waiter or place a new order.</span></section>
  ) : o && o.status !== 'served' ? (
    <section className="track">
      <div className="track-head"><span>Your order · #{o.number}</span><span className="track-eta">{pending ? '⏳ Awaiting confirmation' : o.status === 'ready' ? 'Ready now!' : `~${eta} min`}</span></div>
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
    <section className="track empty"><div className="et-glyph">📲</div><p>No live order yet.</p><span>Tap <b>Order</b> below to browse the menu and send your order to the table.</span><button className="track-cta" style={{ marginTop: 10 }} onClick={() => go('order')}>🛒 Start your order →</button></section>
  );

  const loyaltyBlock = c ? (
    <section className="loyalty-snap">
      <div className="ls points"><span className="ls-n">{c.points.toLocaleString('en-IN')}</span><span className="ls-l">Points</span></div>
      <div className="ls coins"><span className="ls-n">{c.coins}</span><span className="ls-l">Coins 🪙</span></div>
      <div className="ls visits"><span className="ls-n">{c.visits}</span><span className="ls-l">Visits</span></div>
    </section>
  ) : null;

  const bannersBlock = pwa && pwa.banners.length ? <Banners list={pwa.banners} /> : null;
  const featuredBlock = pwa && pwa.featured.length ? <Featured list={pwa.featured} onPick={onPick} /> : null;

  // honor the owner's Home Layout ordering for the reorderable sections
  const order = pwa?.home.sections ?? ['banners', 'track', 'featured', 'loyalty'];
  const blockFor = (s: string) => (s === 'banners' ? bannersBlock : s === 'featured' ? featuredBlock : s === 'track' ? trackBlock : s === 'loyalty' ? loyaltyBlock : null);

  return (
    <>
      <header className="pwa-top">
        <div className="pwa-top-l">
          <span className="pwa-hi">Hi {c?.name ?? 'there'} 👋</span>
          {pwa?.welcome ? <span className="pwa-loc">{pwa.welcome}</span> : null}
          <button className={`table-chip${pwa?.manualPick ? ' cta' : ''}`} onClick={() => setPickOpen(true)} aria-label={pwa?.manualPick ? 'Select your table' : 'Change table'}>
            <span aria-hidden>📍 </span>
            {pwa?.manualPick ? 'Select your table' : `Table ${ctx.table.label}`}
            <span className="chip-change" aria-hidden>{pwa?.manualPick ? ' ▾' : ' · Change'}</span>
          </button>
        </div>
        {c && <span className="tier-ring"><b>{c.tier[0]?.toUpperCase()}</b></span>}
      </header>
      <InstallButton />
      {pwa?.theme.heroTagline ? <p className="pwa-tag">{pwa.theme.heroTagline}</p> : null}

      {pwa?.gameUnlock?.unlocked && (
        <section className="unlock-card" onClick={() => go('play')}>
          <span className="ul-emoji">🎉</span>
          <div><b>You unlocked a reward game!</b><span>Your order qualifies — play &amp; earn points.</span></div>
          <button onClick={(e) => { e.stopPropagation(); go('play'); }}>Play Now</button>
        </section>
      )}

      {order.map((s) => <div key={s}>{blockFor(s)}</div>)}

      <section className="offer-card"><span className="of-emoji">🍫</span><div><b>Add a Brownie</b><span>₹99 · slip it in now</span></div><button onClick={onUpsell}>Add</button></section>
      <div className="quick"><button onClick={() => go('play')}><span>◉</span>Play</button><button onClick={() => go('rewards')}><span>★</span>Rewards</button></div>
      {pickOpen && <TableSheet token={ctx.table.token} onClose={() => setPickOpen(false)} />}
    </>
  );
}

/* auto-sliding promo banner carousel */
function Banners({ list }: { list: PwaBanner[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (list.length < 2) return;
    const t = setInterval(() => setI((n) => (n + 1) % list.length), 4000);
    return () => clearInterval(t);
  }, [list.length]);
  const b = list[Math.min(i, list.length - 1)];
  if (!b) return null;
  const inner = (
    <>
      <img src={b.imageUrl} alt={b.title} />
      {b.title ? <span className="bn-title">{b.title}</span> : null}
    </>
  );
  return (
    <section className="banners">
      {b.link ? <a href={b.link} className="bn-slide">{inner}</a> : <div className="bn-slide">{inner}</div>}
      {list.length > 1 && <div className="bn-dots">{list.map((x, n) => <i key={x.id} className={n === i ? 'on' : ''} onClick={() => setI(n)} />)}</div>}
    </section>
  );
}

/* featured dishes card row */
function Featured({ list, onPick }: { list: PwaFeatured[]; onPick: (id: string) => void }) {
  return (
    <section className="feat">
      <h4 className="feat-h">✨ Featured</h4>
      <div className="feat-row">
        {list.map((f) => (
          <button key={f.id} className="feat-card" onClick={() => onPick(f.id)}>
            {f.imageUrl ? <img src={f.imageUrl} alt={f.name} /> : <span className="feat-noimg">🍽️</span>}
            {f.label ? <em className="feat-badge">{FEAT_LABEL[f.label] ?? f.label}</em> : null}
            <b className="feat-name">{f.name}</b>
            <span className="feat-price">{rupee(f.pricePaise)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

/* manual table picker (QR had no table info) */
/* Bottom-sheet table selector — opened from the header chip. QR scan stays the
   primary path; this is the "select / switch table" button the guest can tap. */
function TableSheet({ token, onClose }: { token: string; onClose: () => void }) {
  const [tables, setTables] = useState<{ token: string; label: string }[]>([]);
  useEffect(() => {
    fetch(`/api/customer/tables?t=${encodeURIComponent(token)}`).then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) setTables(d.tables ?? []); }).catch(() => {});
  }, [token]);
  return (
    <div className="sheet-back" onClick={onClose} role="dialog" aria-modal="true">
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <span className="sheet-grab" />
        <b className="sheet-title">Select your table</b>
        <span className="sheet-sub">Scan a table’s QR code, or tap your table below.</span>
        <div className="tp-grid">
          {tables.map((t) => (
            <a key={t.token} href={`/app?t=${encodeURIComponent(t.token)}`} className={`tp-btn${t.token === token ? ' on' : ''}`}>{t.label}</a>
          ))}
        </div>
        {!tables.length && <span className="sheet-sub">No tables found — please scan the QR on your table.</span>}
      </div>
    </div>
  );
}

/* "Install app" / "Add to Home Screen" — shows the native prompt where supported,
   or iOS Share-sheet instructions on iPhone. Hidden when already installed. */
function InstallButton() {
  const [deferred, setDeferred] = useState<{ prompt: () => void; userChoice: Promise<unknown> } | null>(null);
  const [ios, setIos] = useState(false);
  useEffect(() => {
    const onBip = (e: Event) => { e.preventDefault(); setDeferred(e as unknown as { prompt: () => void; userChoice: Promise<unknown> }); };
    window.addEventListener('beforeinstallprompt', onBip);
    const ua = navigator.userAgent || '';
    const isIos = /iphone|ipad|ipod/i.test(ua);
    const standalone = (navigator as unknown as { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches;
    if (isIos && !standalone) setIos(true);
    return () => window.removeEventListener('beforeinstallprompt', onBip);
  }, []);
  if (deferred) {
    return (
      <button className="install-btn" onClick={async () => { deferred.prompt(); await deferred.userChoice; setDeferred(null); }}>
        ⬇ Install this app
      </button>
    );
  }
  if (ios) return <div className="install-hint">📲 Install: tap <b>Share</b> then <b>“Add to Home Screen”</b></div>;
  return null;
}

/* ---------------- Order (self-serve QR menu + cart) ---------------- */
function Order({ ctx, qs, cart, setCart, reload, onPlaced }: {
  ctx: Ctx;
  qs: string;
  cart: Record<string, number>;
  setCart: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  reload: () => void;
  onPlaced: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [useWallet, setUseWallet] = useState(false);
  const byId = new Map<string, MenuItemDto>();
  for (const c of ctx.menu) for (const i of c.items) byId.set(i.id, i);

  const lines = Object.entries(cart).filter(([, q]) => q > 0);
  const total = lines.reduce((s, [id, q]) => s + (byId.get(id)?.pricePaise ?? 0) * q, 0);
  const count = lines.reduce((s, [, q]) => s + q, 0);

  // wallet redemption preview (server re-clamps authoritatively)
  const w = ctx.pwa?.wallet;
  const walletEligible = !!w?.enabled && w.points >= w.minPointsToRedeem && total > 0;
  const walletDiscountPaise = walletEligible ? Math.min(w!.balancePaise, Math.floor((total * w!.maxRedeemPctOfBill) / 100)) : 0;
  const walletPoints = walletEligible ? Math.ceil((walletDiscountPaise / 100) * w!.pointsPerRupee) : 0;
  const payable = useWallet ? Math.max(0, total - walletDiscountPaise) : total;

  const setQty = (id: string, d: number) =>
    setCart((c) => {
      const q = Math.max(0, (c[id] ?? 0) + d);
      const next = { ...c };
      if (q === 0) delete next[id]; else next[id] = q;
      return next;
    });

  async function place() {
    if (!count || busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/qr-order', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ t: qs.replace('?t=', '') || undefined, lines: lines.map(([itemId, qty]) => ({ itemId, qty })), walletPoints: useWallet ? walletPoints : undefined }),
      });
      if (!res.ok) throw new Error('failed');
      setCart({});
      reload();
      onPlaced();
    } catch {
      setBusy(false);
    }
  }

  if (!ctx.menu.length) {
    return (
      <>
        <header className="pwa-h"><h3>Order</h3></header>
        <p className="anti-cheat">Menu isn’t available right now — please order at the counter.</p>
      </>
    );
  }

  return (
    <>
      <header className="pwa-h"><h3>Order</h3><span>{ctx.outlet.name} · {ctx.table.label} · pay at counter</span></header>
      <div className="ord-list">
        {ctx.menu.map((cat) => (
          <div key={cat.id} className="ord-cat">
            <h4 className="ord-cat-h">{cat.name}</h4>
            {cat.items.map((it) => {
              const q = cart[it.id] ?? 0;
              return (
                <div key={it.id} className="ord-item">
                  <div className="ord-info">
                    <b>{it.name}</b>
                    <span>{rupee(it.pricePaise)}{it.tags?.includes('bestseller') ? ' · ★ Bestseller' : ''}</span>
                  </div>
                  {q === 0 ? (
                    <button className="ord-add" onClick={() => setQty(it.id, 1)} aria-label={`Add ${it.name}`}>Add</button>
                  ) : (
                    <div className="ord-step">
                      <button onClick={() => setQty(it.id, -1)} aria-label={`Remove one ${it.name}`}><Minus size={16} aria-hidden /></button>
                      <span aria-live="polite">{q}</span>
                      <button onClick={() => setQty(it.id, 1)} aria-label={`Add one ${it.name}`}><Plus size={16} aria-hidden /></button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {count > 0 && walletEligible && walletDiscountPaise > 0 && (
        <button className={`wallet-toggle ${useWallet ? 'on' : ''}`} onClick={() => setUseWallet((v) => !v)}>
          <span className="wt-check">{useWallet ? '✓' : ''}</span>
          <span className="wt-label">Use wallet — <b>{rupee(walletDiscountPaise)} off</b><em>{walletPoints} points</em></span>
        </button>
      )}
      {count > 0 && (
        <button className="ord-place" disabled={busy} onClick={place}>
          {busy ? 'Sending…' : <>Send order · {count} item{count > 1 ? 's' : ''} · {rupee(payable)}{useWallet && walletDiscountPaise > 0 ? ` (−${rupee(walletDiscountPaise)})` : ''}</>}
        </button>
      )}
      <p className="anti-cheat">A waiter confirms your order before it reaches the kitchen.</p>
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
  const w = ctx.pwa?.wallet;
  const ly = ctx.pwa?.loyalty;
  const tierName = ly?.tierName ?? ctx.customer?.tier ?? 'Bronze';
  const progress = ly && ly.nextAtSpendPaise ? Math.min(100, Math.round((ly.spendPaise / ly.nextAtSpendPaise) * 100)) : 100;

  return (
    <>
      <header className="pwa-h"><h3>Wallet &amp; rewards</h3></header>
      <div className="wallet-hero">
        <span className="wh-tier">{tierName} member</span>
        <div className="wh-bal">
          <div><span>{points.toLocaleString('en-IN')}</span><em>points</em></div>
          {w?.enabled && <div><span>{rupee(Math.round((points / w.pointsPerRupee)) * 100)}</span><em>wallet value</em></div>}
          <div><span>{ctx.customer?.coins ?? 0}</span><em>coins 🪙</em></div>
        </div>
      </div>

      {ly && (
        <section className="loy-dash">
          <div className="loy-grid">
            <div className="loy-stat"><span>{ly.orders}</span><em>Orders</em></div>
            <div className="loy-stat"><span>{rupee(ly.spendPaise)}</span><em>Total spend</em></div>
            <div className="loy-stat"><span>{ly.points.toLocaleString('en-IN')}</span><em>Points</em></div>
            <div className="loy-stat"><span>{ly.gamesPlayed}</span><em>Games played</em></div>
            <div className="loy-stat"><span>{ly.rewardsWon}</span><em>Rewards won</em></div>
            <div className="loy-stat"><span>{tierName}</span><em>Level</em></div>
          </div>
          {ly.nextTierName && ly.nextAtSpendPaise ? (
            <div className="loy-next">
              <div className="loy-bar"><i style={{ width: progress + '%' }} /></div>
              <span>Spend {rupee(Math.max(0, ly.nextAtSpendPaise - ly.spendPaise))} more to reach <b>{ly.nextTierName}</b></span>
            </div>
          ) : <span className="loy-top">🏆 You’re at the top tier!</span>}
        </section>
      )}

      <h4 className="rew-h">Redeem points</h4>
      <div className="rew-list">
        {ctx.rewards.length === 0 ? (
          <p className="anti-cheat">No rewards to redeem yet — keep earning points!</p>
        ) : ctx.rewards.map((r) => (
          <div key={r.id} className="rew-card">
            <span className="rew-emoji">{REW_EMOJI[r.type] ?? '🎁'}</span>
            <div className="rew-info"><b>{r.name}</b><span>{r.type.replace('_', ' ')}</span></div>
            <button className={points < r.cost ? 'lock' : ''} onClick={() => redeem(r)}>{r.cost} pts</button>
          </div>
        ))}
      </div>
      {w?.enabled && <p className="anti-cheat">💳 Spend points as ₹ off your bill from the Order screen.</p>}
    </>
  );
}

/* ---------------- Onboarding (3-step OTP login) ----------------
   1. mobile number → request a one-time code (dev-scaffold sender)
   2. enter code → verify; returning customers are auto-logged-in here
   3. name → only for brand-new customers (and only when the owner collects it) */
function Register({ cfg, outlet, welcome, qrToken, onDone }: { cfg: { enabled: boolean; collectName: boolean }; outlet: string; welcome: string; qrToken: string | null; onDone: () => void }) {
  const [step, setStep] = useState<'phone' | 'otp' | 'name'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);

  const fingerprint = () => (typeof navigator !== 'undefined' ? `${navigator.userAgent}|${typeof screen !== 'undefined' ? `${screen.width}x${screen.height}` : ''}` : '');

  async function start() {
    setErr(null);
    if (phone.replace(/\D/g, '').length < 8) return setErr('Enter a valid mobile number');
    setBusy(true);
    try {
      const res = await fetch('/api/customer/otp/start', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ t: qrToken || undefined, phone }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error === 'invalid_phone' ? 'Enter a valid mobile number' : 'Could not send code');
      setDevCode(typeof d.devCode === 'string' ? d.devCode : null);
      setCode('');
      setStep('otp');
    } catch (e: any) { setErr(e.message || 'Something went wrong'); }
    finally { setBusy(false); }
  }

  async function verify() {
    setErr(null);
    if (code.replace(/\D/g, '').length < 6) return setErr('Enter the 6-digit code');
    setBusy(true);
    try {
      const res = await fetch('/api/customer/otp/verify', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ t: qrToken || undefined, phone, code, fingerprint: fingerprint() }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (d.error === 'invalid_code') throw new Error(typeof d.remaining === 'number' ? `Incorrect code — ${d.remaining} ${d.remaining === 1 ? 'try' : 'tries'} left` : 'Incorrect code');
        if (d.error === 'otp_expired' || d.error === 'too_many_attempts') { setStep('phone'); setCode(''); throw new Error('That code expired — request a new one'); }
        if (d.error === 'slot_exceeded') throw new Error('This cafe has reached its customer limit. Please ask staff.');
        throw new Error('Could not verify code');
      }
      if (d.needsName && cfg.collectName) setStep('name');
      else onDone(); // returning customer (or name not collected) → straight in
    } catch (e: any) { setErr(e.message || 'Something went wrong'); }
    finally { setBusy(false); }
  }

  async function saveName() {
    setErr(null);
    if (!name.trim()) return setErr('Please enter your name');
    setBusy(true);
    try {
      const res = await fetch('/api/customer/profile', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) throw new Error('Could not save your name');
      onDone();
    } catch (e: any) { setErr(e.message || 'Something went wrong'); setBusy(false); }
  }

  return (
    <div className="reg">
      <img src="/logo chaya one.png" alt="ChayaOne" style={{ width: 120, height: 120, objectFit: 'contain' }} />
      <AlphaTag />

      {step === 'phone' && (
        <>
          <h2 className="reg-h">{welcome || `Welcome to ${outlet}`}</h2>
          <p className="reg-sub">Enter your mobile number to earn points, rewards and play games.</p>
          <div className="reg-form">
            <label className="reg-field"><span>Mobile number</span><input value={phone} onChange={(e) => setPhone(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && start()} type="tel" inputMode="tel" autoComplete="tel" placeholder="9876543210" aria-invalid={!!err} aria-describedby={err ? 'reg-err' : undefined} /></label>
            {err && <p className="reg-err" id="reg-err" role="alert">{err}</p>}
            <button className="reg-btn" disabled={busy} onClick={start}>{busy ? 'Sending…' : 'Send code'}</button>
            <span className="reg-fine">We’ll text you a one-time code to confirm it’s you.</span>
          </div>
        </>
      )}

      {step === 'otp' && (
        <>
          <h2 className="reg-h">Enter your code</h2>
          <p className="reg-sub">We sent a 6-digit code to {phone}.</p>
          <div className="reg-form">
            <label className="reg-field"><span>6-digit code</span><input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} onKeyDown={(e) => e.key === 'Enter' && verify()} type="tel" inputMode="numeric" autoComplete="one-time-code" placeholder="123456" aria-invalid={!!err} aria-describedby={err ? 'reg-err' : undefined} /></label>
            {devCode && <p className="reg-dev">Dev code: <b>{devCode}</b></p>}
            {err && <p className="reg-err" id="reg-err" role="alert">{err}</p>}
            <button className="reg-btn" disabled={busy} onClick={verify}>{busy ? 'Verifying…' : 'Verify & continue'}</button>
            <div className="reg-actions">
              <button type="button" className="reg-link" onClick={() => { setErr(null); setCode(''); setStep('phone'); }}>Change number</button>
              <button type="button" className="reg-link" disabled={busy} onClick={start}>Resend code</button>
            </div>
          </div>
        </>
      )}

      {step === 'name' && (
        <>
          <h2 className="reg-h">Almost there</h2>
          <p className="reg-sub">What should we call you?</p>
          <div className="reg-form">
            <label className="reg-field"><span>Your name</span><input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveName()} autoComplete="name" placeholder="e.g. Arjun" aria-invalid={!!err && !name.trim()} /></label>
            {err && <p className="reg-err" id="reg-err" role="alert">{err}</p>}
            <button className="reg-btn" disabled={busy} onClick={saveName}>{busy ? 'Saving…' : 'Finish'}</button>
            <span className="reg-fine">You can update this anytime.</span>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------- frame + fx ---------------- */
/* QR welcome / landing — the first thing a guest sees after scanning their table
   QR. Cafe identity + table (auto-detected) + today's offers + Start Ordering. */
function Welcome({ ctx, onStart }: { ctx: Ctx; onStart: () => void }) {
  const pwa = ctx.pwa;
  const logo = pwa?.theme.logoUrl ?? '/logo chaya one.png';
  const banners = pwa?.banners ?? [];
  return (
    <div className="welcome">
      <div className="wl-top">
        <div className="wl-logo" style={{ backgroundImage: `url(${logo})` }} />
        <h1 className="wl-cafe">{ctx.outlet.name}</h1>
        {pwa?.theme.heroTagline ? <p className="wl-tag">{pwa.theme.heroTagline}</p> : null}
        <span className="wl-table">📍 Table {ctx.table.label}</span>
      </div>

      {banners.length > 0 && (
        <div className="wl-offers">
          <span className="wl-offers-h">Today’s offers</span>
          <div className="wl-offers-row">
            {banners.slice(0, 5).map((b) => (
              <div key={b.id} className="wl-offer" style={{ backgroundImage: `url(${b.imageUrl})` }}>
                <span>{b.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <button className="wl-start" onClick={onStart}>Start Ordering →</button>
      <span className="wl-foot">You’re seated at {ctx.outlet.name}</span>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="pwa-stage">
      <div className="phone">{children}</div>
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

const loadCss = `
.pwa-load { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; border-radius: 36px; background: radial-gradient(72% 48% at 50% 38%, color-mix(in srgb, var(--turmeric) 12%, transparent), transparent 70%), var(--paper); }
.pwa-load-cap { font-family: var(--font-display); font-size: 16px; font-weight: 600; color: var(--ink-2); letter-spacing: .01em; }
.pwa-load-steam { display: flex; gap: 7px; height: 12px; align-items: flex-end; }
.pwa-load-steam i { width: 7px; height: 7px; border-radius: 50%; opacity: .5; animation: pwaSteam 1.05s ease-in-out infinite; }
.pwa-load-steam i:nth-child(1) { background: var(--cardamom); }
.pwa-load-steam i:nth-child(2) { background: var(--clay); animation-delay: .16s; }
.pwa-load-steam i:nth-child(3) { background: var(--turmeric-d); animation-delay: .32s; }
@keyframes pwaSteam { 0%,100% { transform: translateY(0); opacity: .45; } 50% { transform: translateY(-6px); opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .pwa-load-steam i { animation: none; opacity: .8; } }
`;

const shellCss = `
/* Mobile-first: the app IS the screen — no fake phone frame, edge-to-edge. */
.pwa-stage {
  min-height: 100svh;
  display: flex;
  justify-content: center;
  background: var(--paper);
}
.phone {
  position: relative;
  width: 100%;
  max-width: 480px;
  height: 100svh;
  background: var(--paper);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.pwa-screen {
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--paper);
}
/* Desktop adapts FROM mobile: float the same column as a clean card (not a phone mockup). */
@media (min-width: 600px) {
  .pwa-stage {
    align-items: center;
    padding: 24px;
    min-height: 100vh;
    background: radial-gradient(120% 120% at 50% 0%, color-mix(in srgb, var(--turmeric) 12%, transparent) 0%, color-mix(in srgb, var(--clay) 4%, transparent) 40%, var(--paper) 100%);
  }
  .phone {
    height: 880px;
    max-height: 92vh;
    border-radius: 28px;
    border: 1px solid color-mix(in srgb, var(--line) 60%, transparent);
    box-shadow: var(--sh-3);
  }
  .pwa-screen { border-radius: 28px; }
}
`;

const css = `
.pwa-scroll { flex: 1; overflow-y: auto; padding: 44px 16px 80px; display: flex; flex-direction: column; gap: 18px; }
.pwa-scroll::-webkit-scrollbar { width: 0; }
.pwa-scroll > * { animation: tabFadeIn 0.35s cubic-bezier(0.2, 0.8, 0.2, 1) both; }

@keyframes tabFadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.pwa-nav { 
  position: absolute; 
  bottom: 0; 
  left: 0; 
  right: 0; 
  min-height: 68px; 
  padding-bottom: env(safe-area-inset-bottom); 
  display: grid; 
  grid-template-columns: repeat(4, 1fr); 
  background: color-mix(in srgb, var(--paper-3) 76%, transparent); 
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-top: 1px solid color-mix(in srgb, var(--line) 35%, transparent); 
  z-index: 10;
  box-shadow: 0 -8px 30px rgba(0, 0, 0, 0.02);
}
.pwa-nav button { 
  display: flex; 
  flex-direction: column; 
  align-items: center; 
  justify-content: center; 
  gap: 4px; 
  min-height: 60px; 
  font-size: 11px; 
  font-weight: 700; 
  color: var(--ink-3); 
  background: none; 
  border: none; 
  cursor: pointer; 
  font-family: var(--font-body); 
  transition: all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1); 
  position: relative;
}
.pwa-nav button span { 
  display: grid; 
  place-items: center; 
  transition: transform 0.2s ease;
}
.pwa-nav button:hover span {
  transform: translateY(-2px);
  color: var(--gold-d);
}
.pwa-nav button.on { color: var(--gold-d); }
.pwa-nav button.on span { transform: translateY(-2px) scale(1.08); }
.pwa-nav button.on::after { 
  content: ""; 
  position: absolute; 
  top: 0; 
  left: 50%; 
  transform: translateX(-50%); 
  width: 24px; 
  height: 4px; 
  border-radius: 0 0 4px 4px; 
  background: var(--gold); 
  box-shadow: 0 2px 8px rgba(201, 154, 46, 0.4);
}
.nav-badge { position: absolute; top: 6px; left: 50%; margin-left: 6px; min-width: 16px; height: 16px; padding: 0 4px; border-radius: 99px; background: var(--clay); color: #fff; font-size: 9.5px; font-weight: 800; font-style: normal; display: grid; place-items: center; }

/* table chip (header) + table bottom-sheet + install button */
.pwa-top-l { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.table-chip { align-self: flex-start; display: inline-flex; align-items: center; max-width: 100%; margin-top: 2px; padding: 5px 11px; border-radius: 99px; background: color-mix(in srgb, var(--gold) 14%, transparent); border: 1px solid color-mix(in srgb, var(--gold-d) 38%, transparent); color: var(--ink-2); font-size: 12px; font-weight: 700; font-family: var(--font-body); cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.table-chip.cta { background: var(--gold); color: var(--espresso); border-color: var(--gold-d); animation: chipPulse 1.9s ease-in-out infinite; }
@keyframes chipPulse { 0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--gold) 55%, transparent); } 60% { box-shadow: 0 0 0 7px transparent; } }
.install-btn { width: 100%; padding: 11px; border-radius: 14px; background: var(--gold); color: var(--espresso); border: 1px solid var(--gold-d); font-weight: 800; font-size: 14px; font-family: var(--font-body); cursor: pointer; box-shadow: var(--sh-1); }
.install-hint { font-size: 12.5px; color: var(--ink-2); background: color-mix(in srgb, var(--gold) 12%, transparent); border: 1px solid color-mix(in srgb, var(--gold-d) 32%, transparent); border-radius: 12px; padding: 9px 12px; text-align: center; }
.sheet-back { position: absolute; inset: 0; z-index: 40; background: rgba(0, 0, 0, 0.42); display: flex; align-items: flex-end; animation: fadeIn 0.2s ease; }
.sheet { width: 100%; background: var(--paper); border-radius: 24px 24px 0 0; padding: 12px 16px calc(20px + env(safe-area-inset-bottom)); display: flex; flex-direction: column; gap: 6px; box-shadow: 0 -12px 44px rgba(0, 0, 0, 0.28); animation: sheetUp 0.28s cubic-bezier(0.2, 0.8, 0.2, 1); }
.sheet-grab { width: 40px; height: 4px; border-radius: 99px; background: var(--line-2); align-self: center; margin-bottom: 6px; }
.sheet-title { font-family: var(--font-display); font-size: 18px; font-weight: 600; }
.sheet-sub { font-size: 12.5px; color: var(--ink-3); margin-bottom: 6px; }
.tp-btn.on { background: var(--gold); color: var(--espresso); border-color: var(--gold-d); }
.chip-change { opacity: 0.72; font-weight: 700; }
@keyframes sheetUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

/* QR welcome / landing screen */
.welcome { height: 100%; display: flex; flex-direction: column; gap: 18px; overflow-y: auto; padding: calc(44px + env(safe-area-inset-top)) 22px calc(26px + env(safe-area-inset-bottom)); background: radial-gradient(82% 46% at 50% 0%, color-mix(in srgb, var(--turmeric) 15%, transparent), transparent 70%), var(--paper); animation: tabFadeIn 0.4s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
.wl-top { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 7px; margin-top: 6px; }
.wl-logo { width: 96px; height: 96px; border-radius: 26px; background-size: cover; background-position: center; box-shadow: var(--sh-2); display: grid; place-items: center; }
.wl-logo-fb { background: var(--paper-2); border: 1px solid var(--line); }
.wl-cafe { font-family: var(--font-display); font-size: 30px; font-weight: 600; line-height: 1.12; margin-top: 8px; }
.wl-tag { font-size: 13.5px; color: var(--ink-3); max-width: 300px; line-height: 1.4; }
.wl-table { display: inline-flex; align-items: center; gap: 4px; margin-top: 6px; padding: 7px 15px; border-radius: 99px; background: color-mix(in srgb, var(--gold) 16%, transparent); border: 1px solid color-mix(in srgb, var(--gold-d) 42%, transparent); color: var(--ink-2); font-size: 13px; font-weight: 800; }
.wl-offers { display: flex; flex-direction: column; gap: 9px; }
.wl-offers-h { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ink-3); }
.wl-offers-row { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 4px; scroll-snap-type: x mandatory; }
.wl-offers-row::-webkit-scrollbar { height: 0; }
.wl-offer { flex: 0 0 72%; height: 98px; border-radius: 16px; background-size: cover; background-position: center; display: flex; align-items: flex-end; padding: 10px; box-shadow: var(--sh-1); scroll-snap-align: start; background-color: var(--paper-3); }
.wl-offer span { font-size: 13px; font-weight: 800; color: #fff; text-shadow: 0 1px 8px rgba(0, 0, 0, 0.65); }
.wl-start { margin-top: auto; width: 100%; min-height: 52px; padding: 16px; border-radius: 18px; background: var(--gold); color: var(--espresso); border: 1px solid var(--gold-d); font-family: var(--font-body); font-weight: 800; font-size: 16px; cursor: pointer; box-shadow: var(--sh-2); transition: transform 0.15s ease; }
.wl-start:active { transform: scale(0.98); }
.wl-foot { text-align: center; font-size: 11.5px; color: var(--ink-3); }

.ord-list { display: flex; flex-direction: column; gap: 16px; }
.ord-cat-h { font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; color: var(--ink-2); margin-top: 10px; margin-bottom: 6px; }
.ord-item { 
  display: flex; 
  align-items: center; 
  gap: 12px; 
  padding: 14px 16px; 
  background: color-mix(in srgb, var(--paper-3) 45%, transparent);
  border: 1px solid color-mix(in srgb, var(--line) 30%, transparent);
  border-radius: 18px;
  transition: all 0.25s ease;
  backdrop-filter: blur(4px);
}
.ord-item:hover {
  background: color-mix(in srgb, var(--paper-3) 75%, transparent);
  border-color: color-mix(in srgb, var(--line) 65%, transparent);
  transform: translateY(-1px);
}
.ord-info b { display: block; font-size: 15px; color: var(--ink); } 
.ord-info span { font-size: 12px; color: var(--ink-3); font-weight: 600; }
.ord-add { 
  margin-left: auto; 
  padding: 8px 20px; 
  border-radius: 99px; 
  background: var(--turmeric); 
  color: #2a1607; 
  font-weight: 800; 
  font-size: 13px; 
  border: none; 
  cursor: pointer; 
  box-shadow: 0 2px 6px rgba(232, 144, 42, 0.15);
  transition: all 0.2s;
}
.ord-add:hover {
  background: var(--turmeric-l);
  transform: translateY(-1px);
  box-shadow: 0 4px 10px rgba(232, 144, 42, 0.25);
}
.ord-add:active {
  transform: translateY(0) scale(0.96);
}
.ord-step { margin-left: auto; display: flex; align-items: center; gap: 12px; }
.ord-step button { 
  width: 32px; 
  height: 32px; 
  display: grid; 
  place-items: center; 
  border-radius: 50%; 
  border: 1px solid var(--line-2); 
  background: var(--paper-3); 
  color: var(--ink); 
  cursor: pointer; 
  transition: all 0.2s;
  box-shadow: var(--sh-1);
}
.ord-step button:hover {
  background: var(--paper-2);
  border-color: var(--ink-3);
  color: var(--espresso);
}
.ord-step button:active { transform: scale(0.9); }
.ord-step span { font-weight: 800; min-width: 14px; text-align: center; font-variant-numeric: tabular-nums; }
.ord-place { 
  position: sticky; 
  bottom: 0; 
  width: 100%; 
  padding: 16px; 
  border-radius: 18px; 
  background: var(--gold-grad); 
  color: var(--espresso); 
  font-weight: 800; 
  font-size: 15px; 
  border: 1px solid var(--gold-d); 
  cursor: pointer; 
  box-shadow: var(--sh-3), 0 4px 15px rgba(201, 154, 46, 0.15); 
  transition: all 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.ord-place:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: var(--sh-3), 0 8px 25px rgba(201, 154, 46, 0.3);
}
.ord-place:active:not(:disabled) {
  transform: translateY(0) scale(0.98);
}
.ord-place:disabled { opacity: .7; cursor: default; transform: none; box-shadow: var(--sh-1); }

.pwa-top { display: flex; justify-content: space-between; align-items: center; }
.pwa-hi { display: block; font-family: var(--font-display); font-size: 28px; font-weight: 600; line-height: 1.05; color: var(--ink); }
.pwa-loc { font-size: 12px; color: var(--ink-3); font-weight: 600; }
.pwa-tag { font-size: 13px; color: var(--ink-2); font-weight: 600; margin-top: -8px; }

/* registration */
.reg { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 40px 24px; text-align: center; background: radial-gradient(72% 48% at 50% 30%, color-mix(in srgb, var(--turmeric) 12%, transparent), transparent 70%), var(--paper); border-radius: 36px; }
.reg-h { font-family: var(--font-display); font-size: 30px; font-weight: 600; line-height: 1.08; margin-top: 10px; }
.reg-sub { font-size: 13px; color: var(--ink-3); max-width: 280px; }
.reg-form { width: 100%; max-width: 300px; display: grid; gap: 12px; margin-top: 14px; }
.reg-field { display: grid; gap: 5px; text-align: left; }
.reg-field span { font-size: 12px; font-weight: 700; color: var(--ink-2); }
.reg-field input { width: 100%; padding: 13px 14px; border-radius: 14px; border: 1px solid var(--line-2); background: var(--paper-3); font-size: 16px; outline: none; }
.reg-field input:focus { border-color: var(--gold); box-shadow: 0 0 0 3px color-mix(in srgb, var(--gold) 22%, transparent); }
.reg-err { font-size: 12px; color: var(--clay); font-weight: 700; }
.reg-btn { padding: 14px; border-radius: 14px; background: var(--gold-grad); color: var(--espresso); font-weight: 800; font-size: 15px; border: 1px solid var(--gold-d); cursor: pointer; box-shadow: var(--sh-2), inset 0 1px 0 rgba(255,255,255,.35); }
.reg-btn:active { transform: scale(.99); }
.reg-btn:disabled { opacity: .7; cursor: default; }
.reg-fine { font-size: 10.5px; color: var(--ink-3); line-height: 1.5; }
.reg-dev { font-size: 11px; color: var(--ink-2); background: color-mix(in srgb, var(--gold) 12%, transparent); border: 1px dashed var(--gold-d); border-radius: 10px; padding: 6px 8px; }
.reg-actions { display: flex; justify-content: space-between; gap: 12px; margin-top: 2px; }
.reg-link { background: none; border: none; color: var(--ink-2); font-size: 12px; font-weight: 700; cursor: pointer; padding: 4px; text-decoration: underline; }
.reg-link:disabled { opacity: .5; cursor: default; }

/* manual table picker */
.tablepick { background: color-mix(in srgb, var(--paper-3) 75%, transparent); backdrop-filter: blur(8px); border: 1px solid color-mix(in srgb, var(--line) 40%, transparent); border-radius: 20px; padding: 16px; display: grid; gap: 4px; box-shadow: var(--sh-1); }
.tablepick b { font-size: 15px; color: var(--ink); } 
.tablepick span { font-size: 12px; color: var(--ink-3); }
.tp-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 10px; }
.tp-btn { padding: 12px 0; text-align: center; border-radius: 12px; background: var(--paper); border: 1px solid var(--line-2); font-weight: 800; font-size: 14px; color: var(--ink); text-decoration: none; transition: all 0.2s; }
.tp-btn:hover { background: var(--paper-2); transform: translateY(-1px); }

/* game unlock prompt */
.unlock-card { display: flex; align-items: center; gap: 12px; padding: 16px; border-radius: 22px; cursor: pointer; background: linear-gradient(120deg, color-mix(in srgb, var(--cardamom) 14%, var(--paper-3)), var(--paper-3)); border: 1px solid color-mix(in srgb, var(--cardamom) 50%, transparent); box-shadow: var(--sh-1); transition: all 0.25s ease; }
.unlock-card:hover { transform: translateY(-2px); box-shadow: var(--sh-2); border-color: var(--cardamom); }
.ul-emoji { font-size: 28px; } 
.unlock-card b { display: block; font-size: 14px; color: var(--ink); } 
.unlock-card div span { font-size: 11.5px; color: var(--ink-3); }
.unlock-card button { margin-left: auto; padding: 9px 16px; border-radius: 99px; background: var(--cardamom); color: #fff; font-weight: 800; font-size: 13px; border: none; cursor: pointer; white-space: nowrap; transition: background 0.2s; }
.unlock-card button:hover { background: var(--cardamom-d); }

/* promo banners */
.banners { display: grid; gap: 8px; }
.bn-slide { display: block; position: relative; border-radius: 24px; overflow: hidden; aspect-ratio: 16 / 7; box-shadow: var(--sh-2); border: 1px solid color-mix(in srgb, var(--line) 40%, transparent); }
.bn-slide img { width: 100%; height: 100%; object-fit: cover; display: block; }
.bn-slide::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(18, 11, 7, 0.75) 0%, rgba(18, 11, 7, 0.2) 50%, transparent 100%);
  pointer-events: none;
}
.bn-title { position: absolute; left: 16px; bottom: 12px; color: #fff; font-weight: 800; font-size: 16px; text-shadow: 0 2px 8px rgba(0,0,0,.3); z-index: 2; }
.bn-dots { display: flex; gap: 6px; justify-content: center; }
.bn-dots i { width: 7px; height: 7px; border-radius: 50%; background: var(--line-2); cursor: pointer; transition: background 0.2s; }
.bn-dots i.on { background: var(--turmeric-d); width: 18px; border-radius: 9px; }

/* featured dishes */
.feat-h { font-size: 14px; font-weight: 800; margin-bottom: 8px; color: var(--ink-2); letter-spacing: 0.02em; }
.feat-row { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 6px; margin: 0 -4px; padding-left: 4px; }
.feat-row::-webkit-scrollbar { height: 0; }
.feat-card { 
  position: relative; 
  flex: 0 0 136px; 
  text-align: left; 
  background: color-mix(in srgb, var(--paper-3) 70%, transparent); 
  backdrop-filter: blur(6px);
  border: 1px solid color-mix(in srgb, var(--gold-hair) 35%, transparent); 
  border-radius: 22px; 
  overflow: hidden; 
  padding: 0 0 12px; 
  cursor: pointer; 
  transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1); 
  box-shadow: var(--sh-1);
}
.feat-card:hover { 
  transform: translateY(-3px); 
  box-shadow: var(--sh-2);
  border-color: var(--gold);
}
.feat-card img { width: 100%; height: 90px; object-fit: cover; display: block; transition: transform 0.4s ease; }
.feat-card:hover img { transform: scale(1.04); }
.feat-noimg { display: grid; place-items: center; width: 100%; height: 90px; font-size: 30px; background: var(--paper-2); }
.feat-badge { 
  display: inline-block; 
  position: absolute; 
  top: 8px; 
  left: 8px; 
  font-style: normal; 
  font-size: 9.5px; 
  font-weight: 800; 
  background: var(--turmeric); 
  color: #2a1607; 
  padding: 2px 8px; 
  border-radius: 99px; 
  box-shadow: 0 2px 6px rgba(232, 144, 42, 0.25);
  z-index: 2;
}
.feat-name { display: block; font-size: 13.5px; font-weight: 700; padding: 10px 12px 0; line-height: 1.25; color: var(--ink); }
.feat-price { display: block; font-size: 13px; font-weight: 800; color: var(--turmeric-d); padding: 3px 12px 0; }
.tier-ring { width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center; background: conic-gradient(var(--gold) 70%, var(--line) 0); }
.tier-ring b { width: 34px; height: 34px; border-radius: 50%; background: var(--paper-3); display: grid; place-items: center; font-family: var(--font-display); font-weight: 800; color: var(--gold); }

.track { 
  background: linear-gradient(150deg, color-mix(in srgb, var(--gold) 14%, var(--paper-2)), color-mix(in srgb, var(--paper-3) 92%, transparent)); 
  border: 1px solid color-mix(in srgb, var(--gold-hair) 55%, transparent); 
  border-radius: 26px; 
  padding: 20px; 
  box-shadow: var(--sh-2), inset 0 1px 0 rgba(255, 255, 255, 0.4);
  backdrop-filter: blur(8px);
  transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.track:hover {
  transform: translateY(-2px);
  box-shadow: var(--sh-3);
  border-color: var(--gold-hair);
}
.track.empty, .track.served { text-align: center; display: grid; gap: 6px; place-items: center; }
.track .et-glyph { font-size: 40px; } 
.track.empty p, .track.served p { font-weight: 700; color: var(--ink); } 
.track.empty span { font-size: 12.5px; color: var(--ink-3); }
.track-head { display: flex; justify-content: space-between; font-weight: 700; font-size: 13.5px; color: var(--ink-2); margin-bottom: 12px; }
.track-eta { color: var(--turmeric-d); }
.track-bar { 
  height: 10px; 
  background: color-mix(in srgb, var(--line) 50%, transparent); 
  border-radius: 99px; 
  overflow: hidden; 
  margin-bottom: 18px; 
  border: 1.5px solid color-mix(in srgb, var(--line-2) 15%, transparent);
}
.track-bar i { 
  display: block; 
  height: 100%; 
  border-radius: 99px; 
  background: linear-gradient(90deg, var(--turmeric), var(--clay), var(--turmeric)); 
  background-size: 200% 100%;
  animation: shimmerProgress 2.5s linear infinite;
  transition: width 1s ease-in-out; 
}
@keyframes shimmerProgress {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
.track-steps { display: flex; justify-content: space-between; margin-bottom: 14px; }
.ts { display: flex; flex-direction: column; align-items: center; gap: 6px; flex: 1; }
.ts-dot { 
  width: 14px; 
  height: 14px; 
  border-radius: 50%; 
  background: color-mix(in srgb, var(--line) 60%, transparent); 
  border: 2px solid var(--line-2); 
  transition: all 0.3s ease;
}
.ts.done .ts-dot { 
  background: var(--cardamom); 
  border-color: var(--cardamom); 
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--cardamom) 20%, transparent);
}
.ts.cur .ts-dot { 
  background: var(--turmeric); 
  border-color: #fff; 
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--turmeric) 35%, transparent); 
}
.ts em { font-style: normal; font-size: 9.5px; font-weight: 700; color: var(--ink-3); text-align: center; }
.ts.done em, .ts.cur em { color: var(--ink); }
.track-items { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
.track-items span { font-size: 11px; font-weight: 700; background: var(--paper-2); border: 1px solid var(--line); padding: 4px 10px; border-radius: 99px; color: var(--ink-2); }
.track-cta { width: 100%; padding: 13px; border-radius: 16px; background: var(--ink); color: var(--paper-2); font-weight: 700; font-size: 14px; border: none; cursor: pointer; font-family: var(--font-body); transition: all 0.2s; box-shadow: var(--sh-1); }
.track-cta:hover { background: #1a100a; transform: translateY(-1px); box-shadow: var(--sh-2); }
.track-cta b { color: var(--turmeric-l); }

.loyalty-snap { display: grid; grid-template-columns: repeat(3,1fr); gap: 12px; }
.ls { 
  padding: 16px 12px; 
  border-radius: 20px; 
  text-align: center; 
  border: 1px solid color-mix(in srgb, var(--gold-hair) 40%, transparent); 
  background: color-mix(in srgb, var(--paper-3) 65%, transparent); 
  backdrop-filter: blur(8px);
  box-shadow: var(--sh-1);
  transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.ls:hover {
  transform: translateY(-2px);
  box-shadow: var(--sh-2);
  border-color: var(--gold-hair);
}
.ls.points { background: linear-gradient(135deg, color-mix(in srgb, var(--gold) 14%, var(--paper-3)), color-mix(in srgb, var(--paper-3) 75%, transparent)); }
.ls.coins { background: linear-gradient(135deg, color-mix(in srgb, var(--turmeric) 14%, var(--paper-3)), color-mix(in srgb, var(--paper-3) 75%, transparent)); }
.ls.visits { background: linear-gradient(135deg, color-mix(in srgb, var(--cardamom) 10%, var(--paper-3)), color-mix(in srgb, var(--paper-3) 75%, transparent)); }
.ls-n { display: block; font-size: 24px; font-weight: 700; font-family: var(--font-display); color: var(--ink); line-height: 1.1; }
.ls-l { font-size: 11px; font-weight: 700; color: var(--ink-2); margin-top: 2px; display: block; }

.offer-card { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-radius: 20px; background: color-mix(in srgb, var(--paper-3) 70%, transparent); backdrop-filter: blur(6px); border: 1px solid color-mix(in srgb, var(--line) 40%, transparent); box-shadow: var(--sh-1); transition: all 0.25s; }
.offer-card:hover { transform: translateY(-1px); border-color: var(--line-2); }
.of-emoji { font-size: 26px; } 
.offer-card b { display: block; font-size: 14px; color: var(--ink); } 
.offer-card div span { font-size: 11.5px; color: var(--ink-3); }
.offer-card button { margin-left: auto; padding: 9px 18px; border-radius: 99px; background: var(--turmeric); color: #2a1607; font-weight: 800; font-size: 13px; border: none; cursor: pointer; transition: all 0.2s; }
.offer-card button:hover { background: var(--turmeric-l); transform: translateY(-1px); }

.quick { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.quick button { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 14px; border-radius: 18px; background: var(--ink); color: var(--paper-2); font-weight: 700; font-size: 12px; border: none; cursor: pointer; font-family: var(--font-body); transition: all 0.2s; box-shadow: var(--sh-1); }
.quick button:hover { background: #1a100a; transform: translateY(-1.5px); box-shadow: var(--sh-2); }
.quick button span { font-size: 18px; color: var(--turmeric-l); }

.pwa-h h3 { font-size: 30px; line-height: 1.05; color: var(--ink); } 
.pwa-h span { font-size: 12.5px; color: var(--ink-3); font-weight: 600; }
.wheel-wrap { display: flex; flex-direction: column; align-items: center; position: relative; }
.wheel-pointer { position: absolute; top: -6px; z-index: 4; font-size: 26px; color: var(--ink); }
.wheel { width: 250px; height: 250px; border-radius: 50%; box-shadow: 0 14px 36px rgba(40,20,8,.3), inset 0 0 0 6px #fff; }
.spin-btn { margin-top: 20px; padding: 16px 44px; border-radius: 99px; background: linear-gradient(100deg, var(--clay), var(--turmeric-d)); color: #fff; font-weight: 800; font-size: 17px; letter-spacing: .05em; border: none; cursor: pointer; box-shadow: var(--sh-3); }
.spin-btn:disabled { background: var(--line-2); color: var(--ink-3); cursor: default; box-shadow: none; }
.play-bal { display: flex; gap: 12px; justify-content: center; }
.play-bal span { font-weight: 700; font-size: 13px; background: var(--paper-3); border: 1px solid var(--line); padding: 8px 14px; border-radius: 99px; }
.anti-cheat { font-size: 11px; color: var(--ink-3); text-align: center; line-height: 1.5; }

/* Premium dark card — gold foil and shine effect */
.wallet-hero { 
  border-radius: 26px; 
  padding: 24px; 
  color: #fff; 
  background: linear-gradient(135deg, #2e1d13 0%, #150b06 100%); 
  border: 1px solid rgba(230, 196, 99, 0.25); 
  box-shadow: var(--sh-3), 0 15px 35px rgba(0, 0, 0, 0.25); 
  position: relative;
  overflow: hidden;
}
.wallet-hero::before {
  content: "";
  position: absolute;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(circle, rgba(230,196,99,0.08) 0%, transparent 60%);
  pointer-events: none;
}
.wallet-hero::after {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.03) 45%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.03) 55%, transparent 60%);
  transform: translateX(-100%);
  animation: shineReflect 6s infinite;
  pointer-events: none;
}
@keyframes shineReflect {
  0% { transform: translateX(-100%); }
  20%, 100% { transform: translateX(100%); }
}
.wh-tier { 
  font-size: 11px; 
  font-weight: 800; 
  letter-spacing: .08em; 
  color: #D9A93A; 
  text-transform: uppercase; 
  text-shadow: 0 1px 2px rgba(0,0,0,0.5);
}
.wh-bal { display: flex; gap: 28px; margin-top: 14px; }
.wh-bal span { font-size: 32px; font-weight: 800; font-family: var(--font-display); color: #fff; line-height: 1.1; } 
.wh-bal em { font-style: normal; font-size: 11px; color: #C9B6A0; display: block; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
.rew-h { font-size: 15px; color: var(--ink-2); letter-spacing: 0.01em; margin-bottom: 6px; }
.rew-list { display: flex; flex-direction: column; gap: 10px; }
.rew-card { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-radius: 20px; background: color-mix(in srgb, var(--paper-3) 70%, transparent); backdrop-filter: blur(4px); border: 1px solid color-mix(in srgb, var(--gold-hair) 40%, transparent); box-shadow: var(--sh-1); transition: all 0.25s ease; }
.rew-card:hover { transform: translateY(-1.5px); box-shadow: var(--sh-2); border-color: var(--gold-hair); }
.rew-emoji { font-size: 26px; } 
.rew-info b { display: block; font-size: 14.5px; color: var(--ink); } 
.rew-info span { font-size: 11px; color: var(--ink-3); text-transform: capitalize; font-weight: 600; }
.rew-card button { margin-left: auto; padding: 9px 16px; border-radius: 99px; background: var(--cardamom); color: #fff; font-weight: 800; font-size: 12.5px; border: none; cursor: pointer; white-space: nowrap; transition: all 0.2s; box-shadow: 0 2px 6px rgba(78, 122, 74, 0.2); }
.rew-card button:hover:not(.lock) { background: var(--cardamom-d); transform: translateY(-1px); box-shadow: 0 4px 10px rgba(78, 122, 74, 0.3); }
.rew-card button.lock { background: var(--line-2); color: var(--ink-3); box-shadow: none; cursor: default; }
.rew-card button.lock:hover { transform: none; }

/* wallet checkout toggle */
.wallet-toggle { display: flex; align-items: center; gap: 12px; width: 100%; padding: 14px 16px; margin-bottom: 8px; border-radius: 18px; background: color-mix(in srgb, var(--paper-3) 70%, transparent); backdrop-filter: blur(4px); border: 1.5px solid color-mix(in srgb, var(--line-2) 50%, transparent); cursor: pointer; text-align: left; transition: all 0.25s ease; }
.wallet-toggle.on { border-color: var(--cardamom); background: color-mix(in srgb, var(--cardamom) 8%, var(--paper-3)); }
.wt-check { width: 22px; height: 22px; border-radius: 8px; border: 2px solid var(--line-2); display: grid; place-items: center; font-weight: 900; color: #fff; flex-shrink: 0; transition: all 0.2s; }
.wallet-toggle.on .wt-check { background: var(--cardamom); border-color: var(--cardamom); }
.wt-label { font-size: 14.5px; font-weight: 700; color: var(--ink); } 
.wt-label b { color: var(--cardamom-d); } 
.wt-label em { font-style: normal; display: block; font-size: 11.5px; color: var(--ink-3); font-weight: 600; margin-top: 1px; }

/* loyalty dashboard */
.loy-dash { 
  background: color-mix(in srgb, var(--paper-3) 65%, transparent); 
  backdrop-filter: blur(8px);
  border: 1px solid color-mix(in srgb, var(--gold-hair) 40%, transparent); 
  border-radius: 22px; 
  padding: 18px; 
  display: grid; 
  gap: 14px; 
  box-shadow: var(--sh-1);
}
.loy-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.loy-stat { 
  text-align: center; 
  padding: 8px 0;
  background: color-mix(in srgb, var(--paper-2) 40%, transparent);
  border-radius: 14px;
}
.loy-stat span { display: block; font-size: 18px; font-weight: 800; font-family: var(--font-display); color: var(--ink); }
.loy-stat em { font-style: normal; font-size: 10px; color: var(--ink-3); font-weight: 700; text-transform: uppercase; letter-spacing: 0.02em; }
.loy-next { display: grid; gap: 6px; } 
.loy-next span { font-size: 12px; color: var(--ink-3); text-align: center; font-weight: 600; } 
.loy-next b { color: var(--turmeric-d); }
.loy-bar { height: 8px; background: var(--line); border-radius: 99px; overflow: hidden; border: 0.5px solid color-mix(in srgb, var(--line-2) 40%, transparent); }
.loy-bar i { display: block; height: 100%; background: linear-gradient(90deg, var(--turmeric), var(--gold)); border-radius: 99px; transition: width 1s ease-in-out; }
.loy-top { font-size: 12.5px; text-align: center; color: var(--gold); font-weight: 700; }

.pwa-toast { 
  position: absolute; 
  left: 50%; 
  bottom: 84px; 
  transform: translateX(-50%); 
  z-index: 60; 
  display: flex; 
  gap: 8px; 
  align-items: center; 
  background: rgba(39, 24, 17, 0.88); 
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  color: var(--paper-2); 
  padding: 12px 20px; 
  border-radius: 99px; 
  font-weight: 700; 
  font-size: 13.5px; 
  box-shadow: var(--sh-3), 0 8px 25px rgba(0,0,0,0.15); 
  white-space: nowrap; 
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.confetti { position: absolute; inset: 0; pointer-events: none; z-index: 70; display: grid; place-content: center; }
.confetti i { position: absolute; width: 9px; height: 14px; animation: cfly var(--d) cubic-bezier(.2,.7,.2,1) forwards; }
@keyframes cfly { 0% { transform: translate(0,0) rotate(0); opacity: 1; } 100% { transform: translate(var(--x), var(--y)) rotate(var(--r)); opacity: 0; } }
`;
