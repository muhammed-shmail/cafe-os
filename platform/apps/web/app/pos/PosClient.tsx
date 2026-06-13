'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { computeBill, formatINR, type BillLine } from '@cafeos/core';

export type MenuItemDto = {
  id: string;
  name: string;
  pricePaise: number;
  gstRate: number;
  station: 'kitchen' | 'bar' | 'dessert' | null;
  tags: string[];
};
export type MenuCategory = { id: string; name: string; items: MenuItemDto[] };
export type TableDto = { id: string; label: string; seats: number; state: string };
type Outlet = { id: string; name: string; stateCode: string };
type Staff = { id: string; name: string; role: string };

type Line = {
  key: string;
  itemId: string;
  name: string;
  pricePaise: number;
  gstRate: number;
  station: MenuItemDto['station'];
  qty: number;
};

const EMOJI: Record<string, string> = {
  Coffee: '☕', 'Chai & Tea': '🍵', Coolers: '🥤', 'All-Day': '🍳', Bakery: '🥐', Desserts: '🍰',
};

export default function PosClient({ outlet, staff, menu, tables }: { outlet: Outlet; staff: Staff; menu: MenuCategory[]; tables: TableDto[] }) {
  const router = useRouter();
  const [activeCat, setActiveCat] = useState(menu[0]?.id ?? '');
  const [cart, setCart] = useState<Line[]>([]);
  const [orderType, setOrderType] = useState<'dine_in' | 'takeaway'>('dine_in');
  const [tableId, setTableId] = useState<string | null>(null);
  const [discountPct, setDiscountPct] = useState(0);
  const [scPct, setScPct] = useState(0);
  const [floorOpen, setFloorOpen] = useState(false);
  const [charging, setCharging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const cat = menu.find((c) => c.id === activeCat) ?? menu[0];
  const selectedTable = tables.find((t) => t.id === tableId);

  const bill = useMemo(() => {
    const lines: BillLine[] = cart.map((l) => ({ pricePaise: l.pricePaise, gstRate: l.gstRate, qty: l.qty }));
    return computeBill(lines, { discountPct, serviceChargePct: scPct });
  }, [cart, discountPct, scPct]);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }

  function add(item: MenuItemDto) {
    setCart((c) => {
      const ex = c.find((l) => l.itemId === item.id);
      if (ex) return c.map((l) => (l.itemId === item.id ? { ...l, qty: l.qty + 1 } : l));
      return [...c, { key: item.id, itemId: item.id, name: item.name, pricePaise: item.pricePaise, gstRate: item.gstRate, station: item.station, qty: 1 }];
    });
  }
  function bump(key: string, d: number) {
    setCart((c) => c.flatMap((l) => (l.key === key ? (l.qty + d <= 0 ? [] : [{ ...l, qty: l.qty + d }]) : [l])));
  }
  function clear() {
    setCart([]); setDiscountPct(0); setScPct(0);
  }

  async function lockTill() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  async function submit(withPayment: null | { method: 'cash' | 'upi' | 'card'; tipPaise: number }) {
    if (!cart.length) return;
    if (orderType === 'dine_in' && !tableId) { setFloorOpen(true); return; }
    setBusy(true);
    try {
      const body = {
        clientUuid: crypto.randomUUID(),
        outletId: outlet.id,
        staffId: staff.id,
        type: orderType,
        tableId: orderType === 'dine_in' ? tableId : null,
        lines: cart.map((l) => ({
          itemId: l.itemId,
          nameSnapshot: l.name,
          qty: l.qty,
          unitPricePaise: l.pricePaise,
          gstRate: l.gstRate,
          station: l.station,
          modifiers: [],
        })),
        discountPct,
        serviceChargePct: scPct,
        interState: false,
        ...(withPayment ? { payment: { method: withPayment.method, amountPaise: bill.totalPaise + withPayment.tipPaise, tipPaise: withPayment.tipPaise } } : {}),
      };
      const res = await fetch('/api/orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'failed');
      flash(withPayment ? `Paid ${formatINR(bill.totalPaise + withPayment.tipPaise)} · #${data.order.number}` : `KOT #${data.order.number} sent to kitchen`);
      clear(); setCharging(false);
    } catch (e) {
      flash('Could not save order — check connection');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-[232px_1fr_360px] gap-4 p-4 h-screen max-md:grid-cols-1 max-md:h-auto">
      {/* left rail */}
      <aside className="flex flex-col gap-3.5">
        <div className="flex items-center justify-between">
          <span className="font-display font-bold text-[17px]">◐ {outlet.name.split('—')[0]}</span>
          <button onClick={lockTill} title="Lock till" className="w-8 h-8 rounded-[10px] border grid place-items-center text-sm" style={{ background: 'var(--paper-2)', borderColor: 'var(--line)', color: 'var(--ink-2)' }}>⏏</button>
        </div>
        <div className="flex items-center gap-2 px-1 -mt-1">
          <span className="w-6 h-6 rounded-full grid place-items-center text-[11px] font-extrabold text-white" style={{ background: 'linear-gradient(135deg, var(--turmeric), var(--clay))' }}>{staff.name[0]}</span>
          <span className="text-[12.5px] font-bold">{staff.name}</span>
          <span className="pill" style={{ padding: '2px 8px', fontSize: '10px', textTransform: 'capitalize' }}>{staff.role}</span>
        </div>
        <div className="flex rounded-full p-[3px] border" style={{ background: 'var(--paper-2)', borderColor: 'var(--line)' }}>
          {(['dine_in', 'takeaway'] as const).map((t) => (
            <button key={t} onClick={() => { setOrderType(t); if (t === 'takeaway') setTableId(null); }}
              className="flex-1 py-2 rounded-full font-bold text-[13px] transition"
              style={orderType === t ? { background: 'var(--ink)', color: 'var(--paper-2)' } : { color: 'var(--ink-2)' }}>
              {t === 'dine_in' ? 'Dine-in' : 'Takeaway'}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-1.5 overflow-auto flex-1">
          {menu.map((c) => (
            <button key={c.id} onClick={() => setActiveCat(c.id)}
              className="flex items-center gap-3 px-3 py-3 rounded-[14px] border font-bold text-sm transition text-left"
              style={c.id === activeCat ? { background: 'var(--ink)', color: 'var(--paper-3)', borderColor: 'var(--ink)' } : { background: 'var(--paper-2)', borderColor: 'var(--line)', color: 'var(--ink-2)' }}>
              <span className="text-[17px]">{EMOJI[c.name] ?? '•'}</span>{c.name}
              <span className="ml-auto text-[11px] opacity-60">{c.items.length}</span>
            </button>
          ))}
        </div>
        <button onClick={() => setFloorOpen(true)} className="py-3 rounded-[14px] border-[1.5px] border-dashed font-bold text-[13.5px]" style={{ borderColor: 'var(--line-2)', color: 'var(--ink-2)' }}>
          ⊞ Floor map & tables
        </button>
        {(staff.role === 'owner' || staff.role === 'manager') && (
          <a href="/dashboard" className="py-3 rounded-[14px] text-center font-bold text-[13.5px] transition" style={{ background: 'var(--turmeric)', color: '#2A1607', border: '1px solid var(--turmeric-d)' }}>
            ◉ Owner Dashboard
          </a>
        )}
      </aside>

      {/* menu grid */}
      <section className="flex flex-col min-w-0">
        <div className="flex items-center gap-4 mb-3.5">
          <h2 className="text-[28px]">{cat?.name}</h2>
          <span className="pill ml-auto">{outlet.stateCode} · GST intra-state</span>
        </div>
        <div className="grid gap-3 overflow-auto content-start pr-1" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px,1fr))' }}>
          {cat?.items.map((m) => (
            <button key={m.id} onClick={() => add(m)}
              className="relative text-left p-3.5 rounded-[14px] border flex flex-col gap-2 transition hover:-translate-y-0.5"
              style={{ background: 'var(--paper-2)', borderColor: 'var(--line)', boxShadow: 'var(--sh-1)' }}>
              {m.tags.includes('bestseller') && <span className="absolute top-0 left-0 text-[9.5px] font-extrabold text-white px-2 py-0.5" style={{ background: 'var(--turmeric-d)', borderRadius: '14px 0 14px 0' }}>★ Bestseller</span>}
              <div className="text-3xl">{EMOJI[cat.name] ?? '🍽'}</div>
              <div className="font-bold text-sm leading-tight">{m.name}</div>
              <div className="flex items-center justify-between mt-auto">
                <span className="tnum text-sm" style={{ fontFamily: 'var(--font-mono)' }}>{formatINR(m.pricePaise)}</span>
                <span className="text-[10px] font-bold" style={{ color: 'var(--ink-3)' }}>GST {m.gstRate}%</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* cart */}
      <aside className="card flex flex-col p-[18px] min-h-0">
        <div className="flex justify-between items-start mb-3.5">
          <div>
            <h3 className="text-[19px]">Current ticket</h3>
            <span className="text-[12.5px] font-bold" style={{ color: orderType === 'dine_in' && !tableId ? 'var(--clay)' : 'var(--cardamom-d)' }}>
              {orderType === 'takeaway' ? 'Takeaway' : selectedTable ? `Table ${selectedTable.label}` : 'Pick a table'}
            </span>
          </div>
          <button onClick={clear} className="w-[34px] h-[34px] rounded-[10px] border" style={{ background: 'var(--paper)', borderColor: 'var(--line)' }}>⟲</button>
        </div>

        <div className="flex-1 overflow-auto flex flex-col gap-2">
          {!cart.length ? (
            <div className="grid place-content-center text-center h-full gap-2" style={{ color: 'var(--ink-3)' }}>
              <div className="text-[44px] opacity-40">☕</div><p>Tap items to build the ticket.</p>
            </div>
          ) : cart.map((l) => (
            <div key={l.key} className="grid grid-cols-[1fr_auto_auto] gap-2.5 items-center p-2.5 rounded-[14px] border" style={{ background: 'var(--paper-3)', borderColor: 'var(--line)' }}>
              <div className="font-bold text-[13.5px]">{l.name}</div>
              <div className="flex items-center gap-2">
                <button onClick={() => bump(l.key, -1)} className="w-6 h-6 rounded-[7px] border font-extrabold" style={{ background: 'var(--paper)', borderColor: 'var(--line-2)' }}>−</button>
                <span className="font-bold w-3.5 text-center tnum">{l.qty}</span>
                <button onClick={() => bump(l.key, 1)} className="w-6 h-6 rounded-[7px] border font-extrabold" style={{ background: 'var(--paper)', borderColor: 'var(--line-2)' }}>+</button>
              </div>
              <span className="text-[13.5px] tnum" style={{ fontFamily: 'var(--font-mono)' }}>{formatINR(l.pricePaise * l.qty)}</span>
            </div>
          ))}
        </div>

        {cart.length > 0 && (
          <div className="border-t border-dashed mt-3 pt-3" style={{ borderColor: 'var(--line-2)' }}>
            <Row label="Subtotal" val={formatINR(bill.subtotalPaise)} />
            {discountPct > 0 && <Row label={`Discount (${discountPct}%)`} val={`− ${formatINR(bill.discountPaise)}`} accent />}
            <Row label="CGST" val={formatINR(bill.cgstPaise)} sub />
            <Row label="SGST" val={formatINR(bill.sgstPaise)} sub />
            {scPct > 0 && <Row label="Service charge" val={formatINR(bill.serviceChargePaise)} />}
            <Row label="Round-off" val={`${bill.roundOffPaise >= 0 ? '+' : '−'} ${formatINR(Math.abs(bill.roundOffPaise))}`} sub />
            <div className="flex justify-between font-extrabold font-display text-[19px] mt-2 pt-2 border-t" style={{ borderColor: 'var(--line)' }}>
              <span>Total</span><span className="tnum" style={{ fontFamily: 'var(--font-mono)' }}>{formatINR(bill.totalPaise)}</span>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-3">
              {[0, 5, 10].map((d) => <Chip key={d} on={d === discountPct} onClick={() => setDiscountPct(d)}>{d ? `${d}% off` : 'No disc.'}</Chip>)}
              <Chip on={scPct > 0} onClick={() => setScPct(scPct ? 0 : 5)}>+SC 5%</Chip>
            </div>
          </div>
        )}

        <div className="grid grid-cols-[1fr_1.2fr] gap-2.5 mt-3.5">
          <button disabled={!cart.length || busy} onClick={() => submit(null)} className="btn btn-dark">Send to KOT</button>
          <button disabled={!cart.length || busy} onClick={() => setCharging(true)} className="btn btn-primary">Charge →</button>
        </div>
      </aside>

      {/* floor modal */}
      {floorOpen && (
        <Modal onClose={() => setFloorOpen(false)} title="Floor map">
          <div className="grid grid-cols-4 gap-3 p-5">
            {tables.map((t) => (
              <button key={t.id} onClick={() => { setTableId(t.id); setOrderType('dine_in'); setFloorOpen(false); }}
                className="aspect-square rounded-[14px] border-[1.5px] flex flex-col items-center justify-center gap-1 transition"
                style={tableId === t.id ? { boxShadow: 'var(--sh-glow)', borderColor: 'var(--turmeric-d)' } : { borderColor: 'var(--line)', background: 'var(--paper-3)' }}>
                <span className="font-display font-bold text-[22px]">{t.label}</span>
                <span className="tracking-widest" style={{ color: 'var(--ink-3)' }}>{'•'.repeat(t.seats)}</span>
                <span className="text-[10px] font-bold uppercase" style={{ color: 'var(--ink-3)' }}>{t.state}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}

      {/* charge modal */}
      {charging && (
        <ChargeModal total={bill.totalPaise} busy={busy}
          onClose={() => setCharging(false)}
          onConfirm={(method, tipPaise) => submit({ method, tipPaise })} />
      )}

      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-7 z-[9000] px-5 py-3 rounded-full font-bold text-sm shadow-3" style={{ background: 'var(--ink)', color: 'var(--paper-2)' }}>
          {toast}
        </div>
      )}
    </div>
  );
}

function Row({ label, val, sub, accent }: { label: string; val: string; sub?: boolean; accent?: boolean }) {
  return (
    <div className="flex justify-between py-0.5" style={{ fontSize: sub ? '12.5px' : '13.5px', color: accent ? 'var(--cardamom-d)' : sub ? 'var(--ink-3)' : 'var(--ink-2)', fontWeight: accent ? 700 : 400 }}>
      <span>{label}</span><span className="tnum" style={{ fontFamily: 'var(--font-mono)' }}>{val}</span>
    </div>
  );
}

function Chip({ children, on, onClick }: { children: React.ReactNode; on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="px-3 py-1.5 rounded-full text-xs font-bold border transition"
      style={on ? { background: 'var(--turmeric)', color: '#2a1607', borderColor: 'var(--turmeric-d)' } : { background: 'var(--paper)', borderColor: 'var(--line)', color: 'var(--ink-2)' }}>
      {children}
    </button>
  );
}

function Modal({ children, title, onClose }: { children: React.ReactNode; title: string; onClose: () => void }) {
  return (
    <div onClick={onClose} className="fixed inset-0 z-[800] grid place-items-center p-5" style={{ background: 'rgba(30,18,10,.5)', backdropFilter: 'blur(6px)' }}>
      <div onClick={(e) => e.stopPropagation()} className="w-[min(560px,100%)] max-h-[90vh] overflow-auto" style={{ background: 'var(--paper-2)', borderRadius: '30px', boxShadow: 'var(--sh-3)', border: '1px solid var(--line)' }}>
        <div className="flex items-center gap-3 px-5 py-[18px] border-b" style={{ borderColor: 'var(--line)' }}>
          <h3 className="text-[19px]">{title}</h3>
          <button onClick={onClose} className="ml-auto w-[34px] h-[34px] rounded-[10px] border text-xl" style={{ background: 'var(--paper)', borderColor: 'var(--line)' }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ChargeModal({ total, busy, onClose, onConfirm }: { total: number; busy: boolean; onClose: () => void; onConfirm: (m: 'cash' | 'upi' | 'card', tip: number) => void }) {
  const [method, setMethod] = useState<'cash' | 'upi' | 'card'>('upi');
  const [tip, setTip] = useState(0);
  return (
    <Modal title="Charge" onClose={onClose}>
      <div className="flex justify-between items-baseline px-[22px] py-[18px]">
        <span className="font-semibold" style={{ color: 'var(--ink-2)' }}>Amount due</span>
        <span className="font-display font-extrabold text-[34px] tnum">{formatINR(total + tip)}</span>
      </div>
      <div className="flex items-center gap-2 px-[22px] pb-4 flex-wrap">
        <span className="font-bold text-[13px] mr-1" style={{ color: 'var(--ink-2)' }}>Tip</span>
        {[0, 2000, 5000, 10000].map((t) => (
          <Chip key={t} on={t === tip} onClick={() => setTip(t)}>{t ? formatINR(t) : 'No tip'}</Chip>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2 px-[22px]">
        {(['upi', 'cash', 'card'] as const).map((m) => (
          <button key={m} onClick={() => setMethod(m)} className="flex flex-col items-center gap-1.5 py-3.5 rounded-[14px] border-[1.5px] font-bold text-[12.5px]"
            style={method === m ? { background: 'color-mix(in srgb, var(--turmeric) 14%, var(--paper-3))', borderColor: 'var(--turmeric)', color: 'var(--turmeric-d)' } : { background: 'var(--paper)', borderColor: 'var(--line)', color: 'var(--ink-2)' }}>
            <span className="text-[22px]">{m === 'upi' ? '📲' : m === 'cash' ? '💵' : '💳'}</span>{m.toUpperCase()}
          </button>
        ))}
      </div>
      <div className="grid place-items-center py-[22px] min-h-[120px]">
        {method === 'upi' && <div className="text-center"><div className="w-[130px] h-[130px] mx-auto rounded-[14px] grid place-items-center text-5xl" style={{ background: '#fff', boxShadow: 'var(--sh-2)' }}>▦</div><p className="mt-2 text-sm font-bold">Scan UPI QR · {formatINR(total + tip)}</p></div>}
        {method === 'cash' && <p className="font-bold">Collect {formatINR(total + tip)} in cash</p>}
        {method === 'card' && <p className="font-bold">Tap / insert card on terminal…</p>}
      </div>
      <button disabled={busy} onClick={() => onConfirm(method, tip)} className="btn btn-primary block m-[22px]" style={{ width: 'calc(100% - 44px)' }}>
        {busy ? 'Saving…' : `Confirm payment · ${formatINR(total + tip)}`}
      </button>
    </Modal>
  );
}
