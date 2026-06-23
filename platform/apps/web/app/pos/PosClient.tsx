'use client';

import { useEffect, useMemo, useState } from 'react';
import { computeBill, formatINR, type BillLine } from '@cafeos/core';
import { STAGES, posStageOf } from '@/lib/orderStatus';
import type { Floor } from '@/lib/floors';
import {
  ThemeToggle, Table2, ClipboardList, LayoutDashboard, RefreshCw, Coffee,
  Plus, Minus, X, Check, Printer, Receipt, Smartphone, Banknote, CreditCard,
  CupSoda, UtensilsCrossed, Croissant, Cake, Soup, User, QrCode, type LucideIcon,
} from '@/components/ui';
import { ShiftStatus } from '@/components/ShiftStatus';

/** Category → SVG icon (replaces structural emoji; food glyph stays decorative). */
const CAT_ICON: Record<string, LucideIcon> = {
  Coffee, 'Chai & Tea': Soup, Coolers: CupSoda, 'All-Day': UtensilsCrossed, Bakery: Croissant, Desserts: Cake,
};
const PAY_ICON: Record<'cash' | 'upi' | 'card', LucideIcon> = { cash: Banknote, upi: Smartphone, card: CreditCard };

export type MenuItemDto = {
  id: string;
  name: string;
  pricePaise: number;
  gstRate: number;
  station: 'kitchen' | 'bar' | 'dessert' | null;
  tags: string[];
};
export type MenuCategory = { id: string; name: string; items: MenuItemDto[] };
export type TableDto = { id: string; label: string; seats: number; state: string; floorId: string | null };
type Outlet = { id: string; name: string; stateCode: string; gstEnabled: boolean; gstRate: number | null; gstInclusive: boolean };
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

/** an order this POS has fired, tracked live as the kitchen works it */
type LiveTicket = { id: string; number: number; where: string; status: string; placedAt: number };

const EMOJI: Record<string, string> = {
  Coffee: '☕', 'Chai & Tea': '🍵', Coolers: '🥤', 'All-Day': '🍳', Bakery: '🥐', Desserts: '🍰',
};

/** Floor-map status by order workflow stage (Free → Order → KOT → Ready → Served). */
const TABLE_STAGES = {
  free: { label: 'Free', color: 'var(--ink-3)' },
  order: { label: 'Order', color: '#3B82F6' },   // order taken, not yet sent
  kot: { label: 'KOT', color: '#E8A22B' },        // sent to kitchen / preparing
  ready: { label: 'Ready', color: '#34C759' },    // ready to serve
  served: { label: 'Served', color: '#14B8A6' },  // served, awaiting bill
} as const;
type TableStage = keyof typeof TABLE_STAGES;
const TABLE_STAGE_ORDER: TableStage[] = ['free', 'order', 'kot', 'ready', 'served'];

function tableStage(status?: string): TableStage {
  if (!status) return 'free';
  if (status === 'in_kitchen') return 'kot';
  if (status === 'ready') return 'ready';
  if (status === 'served') return 'served';
  return 'order'; // open / pending_approval / approved
}

export default function PosClient({ outlet, staff, menu, tables, floors }: { outlet: Outlet; staff: Staff; menu: MenuCategory[]; tables: TableDto[]; floors: Floor[] }) {
  const [activeCat, setActiveCat] = useState(menu[0]?.id ?? '');
  const [cart, setCart] = useState<Line[]>([]);
  const [orderType, setOrderType] = useState<'dine_in' | 'takeaway'>('dine_in');
  const [tableId, setTableId] = useState<string | null>(null);
  const [discountPct, setDiscountPct] = useState(0);
  const [scPct, setScPct] = useState(0);
  const [floorOpen, setFloorOpen] = useState(false);
  const [floorFilter, setFloorFilter] = useState<string>('all'); // 'all' | floorId | 'unassigned'
  const [charging, setCharging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [live, setLive] = useState<LiveTicket[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [occupied, setOccupied] = useState<Record<string, { number: number; sinceMs: number; billPaise: number; orders: number; status: string }>>({});

  // 1s clock so the live-order stage colours age (New → Preparing) on their own
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // live table occupancy (occupied until the bill is settled)
  const refreshTables = () => fetch('/api/tables').then((r) => (r.ok ? r.json() : null)).then((d) => { if (d?.occupied) setOccupied(d.occupied); }).catch(() => {});
  useEffect(() => { refreshTables(); }, []);
  useEffect(() => { if (floorOpen) { refreshTables(); setFloorFilter('all'); } }, [floorOpen]);

  // ---- table actions (open / settle / print) for an occupied table ----
  const [tableAction, setTableAction] = useState<{ id: string; label: string } | null>(null);
  const [tableOrder, setTableOrder] = useState<any>(null);
  const [settleBusy, setSettleBusy] = useState(false);
  const [askSettle, setAskSettle] = useState(false);
  const canSettleBill = ['owner', 'manager', 'cashier'].includes(staff.role);

  // ---- inline "add items" + per-line void, inside the table popup ----
  const [addMode, setAddMode] = useState(false);
  const [tableCart, setTableCart] = useState<Line[]>([]);
  const [addSearch, setAddSearch] = useState('');
  const [sendBusy, setSendBusy] = useState(false);
  const [voidBusyId, setVoidBusyId] = useState<string | null>(null);

  // ---- optional customer on the table's bill (defaults to "Customer" when blank) ----
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [showCust, setShowCust] = useState(false);
  const billCustomer = custName.trim() || 'Customer';
  function resetCustomer() { setCustName(''); setCustPhone(''); setShowCust(false); }

  function closeTableActions() {
    setTableAction(null); setTableOrder(null); setAddMode(false); setTableCart([]); setAddSearch(''); resetCustomer();
  }

  async function openTableActions(t: TableDto) {
    setTableAction({ id: t.id, label: t.label });
    setTableOrder(null);
    setAskSettle(false);
    setAddMode(false); setTableCart([]); setAddSearch(''); resetCustomer();
    const d = await fetch(`/api/tables/order?tableId=${t.id}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    setTableOrder(d);
  }

  // refetch the open table's running order without resetting the add panel
  async function refreshTableOrder() {
    if (!tableAction) return null;
    const d = await fetch(`/api/tables/order?tableId=${tableAction.id}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    setTableOrder(d);
    return d;
  }

  // mini-cart helpers (kept separate from the main till `cart`)
  function addToTable(item: MenuItemDto) {
    setTableCart((c) => {
      const ex = c.find((l) => l.itemId === item.id);
      if (ex) return c.map((l) => (l.itemId === item.id ? { ...l, qty: l.qty + 1 } : l));
      return [...c, { key: item.id, itemId: item.id, name: item.name, pricePaise: item.pricePaise, gstRate: item.gstRate, station: item.station, qty: 1 }];
    });
  }
  function bumpTable(key: string, d: number) {
    setTableCart((c) => c.flatMap((l) => (l.key === key ? (l.qty + d <= 0 ? [] : [{ ...l, qty: l.qty + d }]) : [l])));
  }

  async function sendTableCart() {
    if (!tableAction || tableCart.length === 0) return;
    setSendBusy(true);
    try {
      const body = {
        clientUuid: crypto.randomUUID(),
        outletId: outlet.id,
        staffId: staff.id,
        type: 'dine_in' as const,
        tableId: tableAction.id,
        lines: tableCart.map((l) => ({ itemId: l.itemId, nameSnapshot: l.name, qty: l.qty, unitPricePaise: l.pricePaise, gstRate: l.gstRate, station: l.station, modifiers: [] })),
        discountPct: 0,
        serviceChargePct: 0,
        interState: false,
      };
      const r = await fetch('/api/orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error ?? 'failed');
      flash(`KOT #${d.order.number} sent to kitchen`);
      setTableCart([]); setAddMode(false); setAddSearch('');
      await refreshTableOrder(); refreshTables();
    } catch { flash('Could not send — check connection'); }
    finally { setSendBusy(false); }
  }

  async function voidLine(l: { id: string; orderId: string; name: string }) {
    if (!window.confirm(`Remove “${l.name}” from this table? Stock will be restored.`)) return;
    setVoidBusyId(l.id);
    try {
      const r = await fetch('/api/tables/order', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'void_item', orderId: l.orderId, itemId: l.id }) });
      const d = await r.json();
      if (r.ok) {
        flash(d.cancelled ? 'Item removed · order cancelled' : 'Item removed');
        const fresh = await refreshTableOrder();
        refreshTables();
        if (!fresh || fresh.count === 0) closeTableActions(); // table is now empty
      } else flash('Could not remove item');
    } catch { flash('Network error'); }
    finally { setVoidBusyId(null); }
  }

  async function settleTable(method: 'cash' | 'upi' | 'card') {
    if (!tableAction) return;
    setSettleBusy(true);
    try {
      const r = await fetch('/api/tables/order', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'settle', tableId: tableAction.id, method }) });
      const d = await r.json();
      if (r.ok) { flash(`Settled ${formatINR(d.totalPaise)} · ${billCustomer} · ${method.toUpperCase()}`); closeTableActions(); refreshTables(); }
      else flash('Could not settle table');
    } catch { flash('Network error'); } finally { setSettleBusy(false); }
  }

  function printDoc(title: string, inner: string) {
    const w = window.open('', '_blank', 'width=380,height=640');
    if (!w) { flash('Allow pop-ups to print'); return; }
    const close = '<' + '/script>';
    w.document.write(`<html><head><title>${title}</title><style>
      *{font-family:ui-monospace,Menlo,monospace;color:#000;box-sizing:border-box}
      body{width:300px;margin:0 auto;padding:14px;font-size:12px}
      h2{text-align:center;margin:0 0 2px;font-size:15px}
      .muted{color:#555;text-align:center;font-size:11px;margin-bottom:10px}
      table{width:100%;border-collapse:collapse}
      td{padding:2px 0;vertical-align:top} .r{text-align:right}
      .line{border-top:1px dashed #000;margin:8px 0}
      .tot{font-weight:700;font-size:14px}
    </style></head><body>${inner}<script>window.onload=function(){window.print();setTimeout(function(){window.close()},300)}${close}</body></html>`);
    w.document.close();
  }

  function printBill() {
    if (!tableOrder) return;
    const rows = tableOrder.lines.map((l: any) => `<tr><td>${l.qty}× ${l.name}</td><td class="r">${formatINR(l.linePaise)}</td></tr>`).join('');
    const custLine = `${billCustomer}${custPhone.trim() ? ` · ${custPhone.trim()}` : ''}`;
    printDoc(`Bill · ${tableAction?.label ?? ''}`, `
      <h2>${(outlet.name.split('—')[0] ?? outlet.name).trim()}</h2>
      <div class="muted">Table ${tableAction?.label} · Bill</div>
      <div class="muted">👤 ${custLine}</div>
      <table>${rows}</table><div class="line"></div>
      <table>
        <tr><td>Subtotal</td><td class="r">${formatINR(tableOrder.totals.subtotalPaise)}</td></tr>
        <tr><td>GST</td><td class="r">${formatINR(tableOrder.totals.taxPaise)}</td></tr>
        <tr class="tot"><td>Total</td><td class="r">${formatINR(tableOrder.totals.totalPaise)}</td></tr>
      </table>
      <div class="line"></div><div class="muted">Thank you! Served by ${staff.name}</div>`);
  }

  function printKOT() {
    if (!tableOrder) return;
    const rows = tableOrder.lines.map((l: any) => `<tr><td>${l.qty}×</td><td>${l.name}</td><td class="r">${l.station ?? ''}</td></tr>`).join('');
    printDoc(`KOT · ${tableAction?.label ?? ''}`, `
      <h2>KOT · Table ${tableAction?.label}</h2>
      <div class="muted">Kitchen Order Ticket</div>
      <table>${rows}</table><div class="line"></div>
      <div class="muted">${staff.name}</div>`);
  }

  // receipt for a just-charged POS order (cart/bill captured at confirm time)
  function printReceipt(number: number, method: string, tipPaise: number, customer: { name: string; phone: string } | null) {
    const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] as string));
    const rows = cart.map((l) => `<tr><td>${l.qty}× ${esc(l.name)}</td><td class="r">${formatINR(l.pricePaise * l.qty)}</td></tr>`).join('');
    const when = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
    const cust = customer && (customer.name || customer.phone)
      ? `<div class="muted">${[esc(customer.name), esc(customer.phone)].filter(Boolean).join(' · ')}</div>` : '';
    printDoc(`Receipt #${number}`, `
      <h2>${(outlet.name.split('—')[0] ?? outlet.name).trim()}</h2>
      <div class="muted">Receipt #${number} · ${when}</div>
      ${cust}
      <table>${rows}</table><div class="line"></div>
      <table>
        <tr><td>${outlet.gstEnabled && outlet.gstInclusive ? 'Taxable value' : 'Subtotal'}</td><td class="r">${formatINR(bill.subtotalPaise)}</td></tr>
        ${discountPct > 0 ? `<tr><td>Discount (${discountPct}%)</td><td class="r">− ${formatINR(bill.discountPaise)}</td></tr>` : ''}
        ${outlet.gstEnabled ? `<tr><td>CGST</td><td class="r">${formatINR(bill.cgstPaise)}</td></tr>` : ''}
        ${outlet.gstEnabled ? `<tr><td>SGST</td><td class="r">${formatINR(bill.sgstPaise)}</td></tr>` : ''}
        ${scPct > 0 ? `<tr><td>Service charge</td><td class="r">${formatINR(bill.serviceChargePaise)}</td></tr>` : ''}
        <tr><td>Round-off</td><td class="r">${bill.roundOffPaise >= 0 ? '+' : '−'} ${formatINR(Math.abs(bill.roundOffPaise))}</td></tr>
        ${tipPaise > 0 ? `<tr><td>Tip</td><td class="r">${formatINR(tipPaise)}</td></tr>` : ''}
        <tr class="tot"><td>Total</td><td class="r">${formatINR(bill.totalPaise + tipPaise)}</td></tr>
      </table>
      <div class="line"></div>
      <div class="muted">Paid · ${method.toUpperCase()}</div>
      <div class="muted">Thank you! Served by ${staff.name}</div>`);
  }

  // count of QR orders awaiting approval (badge on the Approvals link)
  useEffect(() => {
    let alive = true;
    const refresh = () => fetch('/api/approvals').then((r) => (r.ok ? r.json() : null)).then((d) => { if (alive && d) setPendingApprovals(d.orders?.length ?? 0); }).catch(() => {});
    refresh();
    return () => { alive = false; };
  }, []);

  // follow the same realtime bus the KDS uses, so status flips here the instant
  // the kitchen bumps a ticket. We only care about orders fired from this till.
  useEffect(() => {
    const es = new EventSource('/api/stream');
    es.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      // keep the approvals badge + floor occupancy live as orders arrive / settle
      if (msg.type === 'order.pending' || msg.type === 'order.new' || msg.type === 'order.updated') {
        fetch('/api/approvals').then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) setPendingApprovals(d.orders?.length ?? 0); }).catch(() => {});
        refreshTables();
      }
      if (msg.type !== 'order.updated') return;
      setLive((prev) => {
        if (!prev.some((t) => t.id === msg.ticket.id)) return prev;
        // drop served/settled tickets a moment after they land, so the rail
        // briefly shows the green→teal hand-off then clears itself
        if (msg.ticket.status === 'served' || msg.ticket.status === 'settled') {
          setTimeout(() => setLive((p) => p.filter((t) => t.id !== msg.ticket.id)), 4000);
        }
        return prev.map((t) => (t.id === msg.ticket.id ? { ...t, status: msg.ticket.status } : t));
      });
    };
    return () => es.close();
  }, []);

  const cat = menu.find((c) => c.id === activeCat) ?? menu[0];
  const selectedTable = tables.find((t) => t.id === tableId);

  const bill = useMemo(() => {
    const lines: BillLine[] = cart.map((l) => ({ pricePaise: l.pricePaise, gstRate: l.gstRate, qty: l.qty }));
    return computeBill(lines, { discountPct, serviceChargePct: scPct, gstEnabled: outlet.gstEnabled, gstRateOverride: outlet.gstRate, gstInclusive: outlet.gstInclusive });
  }, [cart, discountPct, scPct, outlet.gstEnabled, outlet.gstRate, outlet.gstInclusive]);

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

  async function submit(
    withPayment: null | { method: 'cash' | 'upi' | 'card'; tipPaise: number },
    opts?: { customer?: { name: string; phone: string } | null; print?: boolean },
  ) {
    if (!cart.length) return;
    if (orderType === 'dine_in' && !tableId) { setCharging(false); setFloorOpen(true); flash('Pick a table first'); return; }
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
      // print the receipt before clearing the cart (cart/bill are read inside printReceipt)
      if (withPayment && opts?.print) printReceipt(data.order.number, withPayment.method, withPayment.tipPaise, opts.customer ?? null);
      // start tracking it on the live rail (idempotent replays return the same order)
      const where = orderType === 'takeaway' ? '🥡 Takeaway' : selectedTable ? `Table ${selectedTable.label}` : 'Dine-in';
      setLive((prev) => (prev.some((t) => t.id === data.order.id) ? prev : [{ id: data.order.id, number: data.order.number, where, status: data.order.status ?? 'in_kitchen', placedAt: Date.now() }, ...prev]));
      clear(); setCharging(false);
      // reset the table so the next order must pick one (don't silently reuse the last table)
      if (orderType === 'dine_in') setTableId(null);
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
          <div className="flex items-center gap-2">
            <div className="w-12 h-7 shrink-0 overflow-hidden flex items-center justify-center">
              <img
                src="/logo chaya one.png"
                alt="ChayaOne"
                className="w-full h-full object-contain"
              />
            </div>
            <span className="font-display font-bold text-[17px]">{(outlet.name.split('—')[0] ?? '').trim()}</span>
          </div>
          <ThemeToggle />
        </div>
        <div className="flex items-center gap-2 px-1 -mt-1">
          <span className="w-6 h-6 rounded-full grid place-items-center text-[11px] font-extrabold text-white" style={{ background: 'linear-gradient(135deg, var(--turmeric), var(--clay))' }}>{staff.name[0]}</span>
          <span className="text-[12.5px] font-bold">{staff.name}</span>
          <span className="pill" style={{ padding: '2px 8px', fontSize: '10px', textTransform: 'capitalize' }}>{staff.role}</span>
        </div>
        <div className="px-1">
          <ShiftStatus />
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
          {menu.map((c) => {
            const Ic = CAT_ICON[c.name] ?? Coffee;
            const on = c.id === activeCat;
            return (
              <button key={c.id} onClick={() => setActiveCat(c.id)} aria-pressed={on}
                className="flex items-center gap-3 px-3 py-3 rounded-[14px] border font-bold text-sm transition text-left"
                style={on ? { background: 'var(--ink)', color: 'var(--paper-3)', borderColor: 'var(--ink)' } : { background: 'var(--paper-2)', borderColor: 'var(--line)', color: 'var(--ink-2)' }}>
                <Ic size={18} aria-hidden className="shrink-0" />{c.name}
                <span className="ml-auto text-[11px] opacity-60 tnum">{c.items.length}</span>
              </button>
            );
          })}
        </div>
        <button onClick={() => setFloorOpen(true)} className="flex items-center justify-center gap-2 py-3 rounded-[14px] border-[1.5px] border-dashed font-bold text-[13.5px]" style={{ borderColor: 'var(--line-2)', color: 'var(--ink-2)' }}>
          <Table2 size={17} aria-hidden /> Floor map &amp; tables
        </button>
        <a href="/approvals" className="relative flex items-center justify-center gap-2 py-3 rounded-[14px] font-bold text-[13.5px] transition" style={{ background: 'var(--paper-2)', border: '1px solid var(--line)', color: 'var(--ink-2)' }}>
          <ClipboardList size={17} aria-hidden /> QR Approvals
          {pendingApprovals > 0 && (
            <span className="absolute -top-2 -right-2 min-w-[20px] h-5 px-1.5 grid place-items-center rounded-full text-[11px] font-extrabold text-white tnum" style={{ background: 'var(--clay)' }} aria-label={`${pendingApprovals} pending`}>{pendingApprovals}</span>
          )}
        </a>
        {(staff.role === 'owner' || staff.role === 'manager') && (
          <a href="/dashboard" className="flex items-center justify-center gap-2 py-3 rounded-[14px] font-bold text-[13.5px] transition" style={{ background: 'var(--turmeric)', color: '#2A1607', border: '1px solid var(--turmeric-d)' }}>
            <LayoutDashboard size={17} aria-hidden /> Owner Dashboard
          </a>
        )}
      </aside>

      {/* menu grid */}
      <section className="flex flex-col min-w-0">
        <div className="flex items-center gap-4 mb-3.5">
          <h2 className="text-[28px]">{cat?.name}</h2>
          <span className="pill ml-auto">{outlet.stateCode} · GST intra-state</span>
        </div>

        {live.length > 0 && <LiveOrders tickets={live} now={now} />}

        <div className="grid gap-3 overflow-auto content-start pr-1" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px,1fr))' }}>
          {cat?.items.map((m) => (
            <button key={m.id} onClick={() => add(m)}
              className="relative text-left p-3.5 rounded-[14px] border flex flex-col gap-2 transition hover:-translate-y-0.5"
              style={{ background: 'var(--paper-2)', borderColor: 'var(--line)', boxShadow: 'var(--sh-1)' }}>
              {m.tags.includes('bestseller') && <span className="absolute top-0 left-0 text-[9.5px] font-extrabold text-white px-2 py-0.5" style={{ background: 'var(--turmeric-d)', borderRadius: '14px 0 14px 0' }}>★ Bestseller</span>}
              <div className="text-3xl" aria-hidden>{EMOJI[cat.name] ?? '🍽'}</div>
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
            {orderType === 'dine_in' ? (
              <button onClick={() => setFloorOpen(true)} title="Change table" className="text-[12.5px] font-bold underline-offset-2 hover:underline" style={{ color: !tableId ? 'var(--clay)' : 'var(--cardamom-d)' }}>
                {selectedTable ? `Table ${selectedTable.label}` : 'Pick a table'}
              </button>
            ) : (
              <span className="text-[12.5px] font-bold" style={{ color: 'var(--cardamom-d)' }}>Takeaway</span>
            )}
          </div>
          <button onClick={clear} disabled={!cart.length} title="Clear ticket" aria-label="Clear ticket" className="btn btn-icon btn-sm btn-ghost"><RefreshCw size={16} aria-hidden /></button>
        </div>

        <div className="flex-1 overflow-auto flex flex-col gap-2">
          {!cart.length ? (
            <div className="grid place-content-center text-center h-full gap-2" style={{ color: 'var(--ink-3)' }}>
              <Coffee size={40} className="mx-auto opacity-40" aria-hidden /><p>Tap items to build the ticket.</p>
            </div>
          ) : cart.map((l) => (
            <div key={l.key} className="grid grid-cols-[1fr_auto_auto] gap-2.5 items-center p-2.5 rounded-[14px] border" style={{ background: 'var(--paper-3)', borderColor: 'var(--line)' }}>
              <div className="font-bold text-[13.5px]">{l.name}</div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => bump(l.key, -1)} aria-label={`Decrease ${l.name}`} className="w-8 h-8 grid place-items-center rounded-[9px] border" style={{ background: 'var(--paper)', borderColor: 'var(--line-2)' }}><Minus size={15} aria-hidden /></button>
                <span className="font-bold w-5 text-center tnum">{l.qty}</span>
                <button onClick={() => bump(l.key, 1)} aria-label={`Increase ${l.name}`} className="w-8 h-8 grid place-items-center rounded-[9px] border" style={{ background: 'var(--paper)', borderColor: 'var(--line-2)' }}><Plus size={15} aria-hidden /></button>
              </div>
              <span className="text-[13.5px] tnum" style={{ fontFamily: 'var(--font-mono)' }}>{formatINR(l.pricePaise * l.qty)}</span>
            </div>
          ))}
        </div>

        {cart.length > 0 && (
          <div className="border-t border-dashed mt-3 pt-3" style={{ borderColor: 'var(--line-2)' }}>
            <Row label={outlet.gstEnabled && outlet.gstInclusive ? 'Taxable value' : 'Subtotal'} val={formatINR(bill.subtotalPaise)} />
            {discountPct > 0 && <Row label={`Discount (${discountPct}%)`} val={`− ${formatINR(bill.discountPaise)}`} accent />}
            {outlet.gstEnabled && <Row label="CGST" val={formatINR(bill.cgstPaise)} sub />}
            {outlet.gstEnabled && <Row label="SGST" val={formatINR(bill.sgstPaise)} sub />}
            {outlet.gstEnabled && outlet.gstInclusive && <div className="text-[10px] mt-0.5" style={{ color: 'var(--ink-3)' }}>Menu prices include GST</div>}
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
          <button disabled={!cart.length || busy} onClick={() => { if (orderType === 'dine_in' && !tableId) { setFloorOpen(true); flash('Pick a table first'); return; } setCharging(true); }} className="btn btn-primary">Charge →</button>
        </div>
      </aside>

      {/* floor modal */}
      {floorOpen && (() => {
        // group tables under their floor; a missing/stale floorId falls under "Unassigned"
        const floorIds = new Set(floors.map((f) => f.id));
        const hasUnassigned = tables.some((t) => !t.floorId || !floorIds.has(t.floorId));
        const groups: { key: string; name: string; tables: TableDto[] }[] = [
          ...floors.map((f) => ({ key: f.id, name: f.name, tables: tables.filter((t) => t.floorId === f.id) })),
          { key: 'unassigned', name: 'Unassigned', tables: tables.filter((t) => !t.floorId || !floorIds.has(t.floorId)) },
        ].filter((g) => g.tables.length > 0);

        const renderTableButton = (t: TableDto) => {
          const occ = occupied[t.id];
          const stage = tableStage(occ?.status);
          const s = TABLE_STAGES[stage];
          const mins = occ ? Math.floor((now - occ.sinceMs) / 60000) : 0;
          const selected = tableId === t.id;
          return (
            <button key={t.id} onClick={() => { if (occ) { openTableActions(t); } else { setTableId(t.id); setOrderType('dine_in'); setFloorOpen(false); } }}
              className="aspect-square rounded-[14px] border-[1.5px] flex flex-col items-center justify-center gap-1 transition"
              style={{
                borderColor: selected ? 'var(--turmeric-d)' : s.color,
                borderTopWidth: 4, borderTopColor: s.color,
                background: occ ? `color-mix(in srgb, ${s.color} 10%, var(--paper-3))` : 'var(--paper-3)',
                boxShadow: selected ? 'var(--sh-glow)' : undefined,
              }}>
              <span className="font-display font-bold text-[22px]">{t.label}</span>
              {occ ? (
                <>
                  <span className="text-[11px] font-bold tnum" style={{ color: 'var(--ink-2)' }}>#{occ.number} · {formatINR(occ.billPaise)}</span>
                  <span className="text-[10px] font-bold uppercase" style={{ color: s.color }}>{s.label} · {mins}m</span>
                </>
              ) : (
                <>
                  <span className="tracking-widest" style={{ color: 'var(--ink-3)' }}>{'•'.repeat(t.seats)}</span>
                  <span className="text-[10px] font-bold uppercase" style={{ color: 'var(--ink-3)' }}>Free</span>
                </>
              )}
            </button>
          );
        };

        const showAll = floorFilter === 'all';
        const shownGroups = showAll ? groups : groups.filter((g) => g.key === floorFilter);

        return (
        <Modal onClose={() => setFloorOpen(false)} title="Floor map">
          {/* status legend — by order stage */}
          <div className="flex flex-wrap gap-4 px-5 pt-4">
            {TABLE_STAGE_ORDER.map((k) => (
              <span key={k} className="inline-flex items-center gap-1.5 text-xs font-bold" style={{ color: 'var(--ink-2)' }}>
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: TABLE_STAGES[k].color }} />{TABLE_STAGES[k].label}
              </span>
            ))}
          </div>

          {/* floor filter chips — only when floors are configured */}
          {floors.length > 0 && (
            <div className="flex flex-wrap gap-2 px-5 pt-4">
              <Chip on={floorFilter === 'all'} onClick={() => setFloorFilter('all')}>All</Chip>
              {floors.map((f) => (
                <Chip key={f.id} on={floorFilter === f.id} onClick={() => setFloorFilter(f.id)}>{f.name}</Chip>
              ))}
              {hasUnassigned && (
                <Chip on={floorFilter === 'unassigned'} onClick={() => setFloorFilter('unassigned')}>Unassigned</Chip>
              )}
            </div>
          )}

          {/* grouped (All) vs single-floor grid */}
          {showAll && floors.length > 0 ? (
            <div className="p-5 flex flex-col gap-5">
              {shownGroups.map((g) => (
                <div key={g.key}>
                  <div className="text-[11px] font-bold uppercase tracking-wide mb-2.5" style={{ color: 'var(--ink-3)' }}>{g.name}</div>
                  <div className="grid grid-cols-4 gap-3">{g.tables.map(renderTableButton)}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-3 p-5">
              {(shownGroups.flatMap((g) => g.tables)).map(renderTableButton)}
            </div>
          )}
        </Modal>
        );
      })()}

      {/* table actions — opens when an occupied table is tapped */}
      {tableAction && (
        <Modal onClose={closeTableActions} title={`Table ${tableAction.label}`}>
          {!tableOrder ? (
            <p className="p-6 text-center" style={{ color: 'var(--ink-3)' }}>Loading order…</p>
          ) : addMode ? (
            /* ── inline add-items panel ── */
            (() => {
              const q = addSearch.trim().toLowerCase();
              const items = menu.flatMap((c) => c.items).filter((it) => !q || it.name.toLowerCase().includes(q));
              const cartTotal = tableCart.reduce((s, l) => s + l.pricePaise * l.qty, 0);
              return (
                <div className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <button onClick={() => { setAddMode(false); setAddSearch(''); }} className="text-xs font-bold" style={{ color: 'var(--ink-3)' }}>← Back</button>
                    <span className="font-bold text-[13px]" style={{ color: 'var(--ink-2)' }}>Add to Table {tableAction.label}</span>
                  </div>

                  <input
                    value={addSearch}
                    onChange={(e) => setAddSearch(e.target.value)}
                    placeholder="Search menu…"
                    className="w-full p-2.5 rounded-xl border text-sm outline-none mb-3"
                    style={{ background: 'var(--paper-3)', borderColor: 'var(--line)' }}
                  />

                  <div className="max-h-[230px] overflow-auto flex flex-col gap-1 mb-3">
                    {items.length === 0 ? (
                      <p className="text-sm text-center py-4" style={{ color: 'var(--ink-3)' }}>No items match.</p>
                    ) : items.map((it) => (
                      <button key={it.id} onClick={() => addToTable(it)} className="flex justify-between items-center gap-2 text-sm p-2.5 rounded-xl text-left" style={{ background: 'var(--paper-3)' }}>
                        <span className="min-w-0"><b className="block truncate">{it.name}</b><span className="text-xs" style={{ color: 'var(--ink-3)' }}>{formatINR(it.pricePaise)}{it.station ? ` · ${it.station}` : ''}</span></span>
                        <span className="shrink-0 w-7 h-7 grid place-items-center rounded-lg" style={{ background: 'var(--turmeric)', color: '#2A1607' }} aria-hidden><Plus size={16} /></span>
                      </button>
                    ))}
                  </div>

                  {tableCart.length > 0 && (
                    <div className="flex flex-col gap-1.5 border-t py-3 mb-3" style={{ borderColor: 'var(--line)' }}>
                      {tableCart.map((l) => (
                        <div key={l.key} className="flex items-center justify-between text-sm">
                          <span className="min-w-0 truncate">{l.name}</span>
                          <span className="flex items-center gap-2 shrink-0">
                            <button onClick={() => bumpTable(l.key, -1)} className="w-6 h-6 rounded-[7px] border font-extrabold" style={{ borderColor: 'var(--line)' }}>−</button>
                            <b className="w-5 text-center tnum">{l.qty}</b>
                            <button onClick={() => bumpTable(l.key, 1)} className="w-6 h-6 rounded-[7px] border font-extrabold" style={{ borderColor: 'var(--line)' }}>+</button>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <button onClick={sendTableCart} disabled={tableCart.length === 0 || sendBusy} className="btn btn-primary w-full" style={tableCart.length === 0 ? { opacity: 0.5 } : undefined}>
                    {sendBusy ? 'Sending…' : `Send to kitchen${cartTotal > 0 ? ` · ${formatINR(cartTotal)}` : ''}`}
                  </button>
                </div>
              );
            })()
          ) : (
            <div className="p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="font-bold text-[13px]" style={{ color: 'var(--ink-2)' }}>
                  {tableOrder.count} order{tableOrder.count > 1 ? 's' : ''} · #{tableOrder.orders.map((o: any) => o.number).join(', ')}
                </span>
                <span className="font-display font-extrabold text-2xl tnum">{formatINR(tableOrder.totals.totalPaise)}</span>
              </div>

              <div className="max-h-[240px] overflow-auto flex flex-col gap-1.5 border-t border-b py-3 mb-4" style={{ borderColor: 'var(--line)' }}>
                {tableOrder.lines.length === 0 ? (
                  <p className="text-sm text-center py-2" style={{ color: 'var(--ink-3)' }}>No items yet.</p>
                ) : tableOrder.lines.map((l: any) => (
                  <div key={l.id} className="flex justify-between items-center gap-2 text-sm">
                    <span className="min-w-0"><b className="mr-1.5" style={{ color: 'var(--turmeric-d)' }}>{l.qty}×</b>{l.name}</span>
                    <span className="flex items-center gap-2 shrink-0">
                      <span className="tnum" style={{ fontFamily: 'var(--font-mono)' }}>{formatINR(l.linePaise)}</span>
                      {canSettleBill && (
                        <button onClick={() => voidLine(l)} disabled={voidBusyId === l.id} title="Remove item" aria-label={`Remove ${l.name}`} className="w-7 h-7 grid place-items-center rounded-lg" style={{ background: 'var(--paper-3)', color: 'var(--clay, #c0392b)', opacity: voidBusyId === l.id ? 0.5 : 1 }}><X size={15} aria-hidden /></button>
                      )}
                    </span>
                  </div>
                ))}
              </div>

              {/* customer on the bill — optional, defaults to "Customer" */}
              <div className="mb-3">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 text-[12.5px] font-bold" style={{ color: custName.trim() ? 'var(--ink-2)' : 'var(--ink-3)' }}>
                    <User size={14} aria-hidden /> {billCustomer}{custPhone.trim() ? ` · ${custPhone.trim()}` : ''}
                  </span>
                  <button onClick={() => setShowCust((v) => !v)} className="ml-auto text-xs font-bold" style={{ color: 'var(--turmeric-d)' }}>
                    {showCust ? 'Done' : custName.trim() ? 'Edit' : '＋ Add customer'}
                  </button>
                </div>
                {showCust && (
                  <div className="rounded-[12px] border p-2.5 mt-2 flex flex-col gap-2" style={{ borderColor: 'var(--line)', background: 'var(--paper)' }}>
                    <input value={custName} onChange={(e) => setCustName(e.target.value)} placeholder="Customer name"
                      className="px-3 py-2 rounded-[10px] border text-sm" style={{ borderColor: 'var(--line)', background: 'var(--paper-2)' }} />
                    <input value={custPhone} onChange={(e) => setCustPhone(e.target.value)} placeholder="Phone (optional)" inputMode="tel"
                      className="px-3 py-2 rounded-[10px] border text-sm" style={{ borderColor: 'var(--line)', background: 'var(--paper-2)' }} />
                    {(custName.trim() || custPhone.trim()) && (
                      <button onClick={() => resetCustomer()} className="self-start text-xs font-bold" style={{ color: 'var(--ink-3)' }}>Clear</button>
                    )}
                  </div>
                )}
              </div>

              {askSettle && canSettleBill ? (
                <div>
                  <p className="text-[13px] font-bold mb-2" style={{ color: 'var(--ink-2)' }}>Take payment · {billCustomer} · {formatINR(tableOrder.totals.totalPaise)}</p>
                  <div className="grid grid-cols-3 gap-2">
                    {(['cash', 'upi', 'card'] as const).map((m) => {
                      const PI = PAY_ICON[m];
                      return (
                        <button key={m} disabled={settleBusy} onClick={() => settleTable(m)} className="flex flex-col items-center gap-1.5 py-3.5 rounded-[14px] border-[1.5px] font-bold text-[12.5px]" style={{ background: 'var(--paper)', borderColor: 'var(--line)', color: 'var(--ink-2)' }}>
                          <PI size={22} aria-hidden />{m.toUpperCase()}
                        </button>
                      );
                    })}
                  </div>
                  <button onClick={() => setAskSettle(false)} className="text-xs font-bold mt-3" style={{ color: 'var(--ink-3)' }}>← Back</button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2.5">
                  <button onClick={() => { setAddMode(true); setTableCart([]); setAddSearch(''); }} className="btn btn-dark"><Plus size={16} aria-hidden /> Add items</button>
                  <button onClick={printKOT} className="btn"><Receipt size={16} aria-hidden /> Print KOT</button>
                  {canSettleBill && <button onClick={printBill} className="btn"><Printer size={16} aria-hidden /> Print bill</button>}
                  {canSettleBill && <button onClick={() => setAskSettle(true)} className="btn btn-primary"><Check size={16} aria-hidden /> Settle</button>}
                </div>
              )}
              {!canSettleBill && <p className="text-[11px] mt-3 text-center" style={{ color: 'var(--ink-3)' }}>Settling, bill printing & removing items need cashier, manager or owner access.</p>}
            </div>
          )}
        </Modal>
      )}

      {/* charge modal */}
      {charging && (
        <ChargeModal total={bill.totalPaise} busy={busy}
          onClose={() => setCharging(false)}
          onConfirm={(method, tipPaise, opts) => submit({ method, tipPaise }, opts)} />
      )}

      {toast && (
        <div role="status" aria-live="polite" className="anim-slide-in fixed left-1/2 -translate-x-1/2 bottom-7 z-[9000] px-5 py-3 rounded-full font-bold text-sm shadow-3" style={{ background: 'var(--ink)', color: 'var(--paper-2)' }}>
          {toast}
        </div>
      )}
    </div>
  );
}

/** Petpooja-style live order rail: every fired ticket, colour-coded by stage. */
function LiveOrders({ tickets, now }: { tickets: LiveTicket[]; now: number }) {
  return (
    <div className="mb-3.5">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[12px] font-extrabold uppercase tracking-wide" style={{ color: 'var(--ink-3)' }}>Live orders</span>
        <span className="text-[11px] font-bold" style={{ color: 'var(--ink-3)' }}>· {tickets.length} running</span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {tickets.map((t) => {
          const stage = posStageOf(t.status, now - t.placedAt);
          const st = STAGES[stage];
          const secs = Math.floor((now - t.placedAt) / 1000);
          return (
            <div key={t.id} className="shrink-0 rounded-[12px] border px-3 py-2 flex flex-col gap-1.5"
              style={{ background: 'var(--paper-2)', borderColor: 'var(--line)', borderLeft: `4px solid ${st.color}`, minWidth: 134 }}>
              <div className="flex items-center justify-between gap-3">
                <span className="font-display font-extrabold text-[15px]">#{t.number}</span>
                <span className="text-[11px] font-bold tnum" style={{ color: 'var(--ink-3)' }}>{fmtClock(secs)}</span>
              </div>
              <span className="text-[11px] font-bold" style={{ color: 'var(--ink-2)' }}>{t.where}</span>
              <span className="inline-flex items-center gap-1.5 self-start text-[10px] font-extrabold uppercase tracking-wide px-2 py-0.5 rounded-full"
                style={{ background: st.bg, color: st.color }}>
                <span className="w-[6px] h-[6px] rounded-full" style={{ background: st.color }} />
                {st.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function fmtClock(secs: number) {
  const m = String(Math.floor(secs / 60)).padStart(2, '0');
  const s = String(secs % 60).padStart(2, '0');
  return `${m}:${s}`;
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

function ChargeModal({ total, busy, onClose, onConfirm }: { total: number; busy: boolean; onClose: () => void; onConfirm: (m: 'cash' | 'upi' | 'card', tip: number, opts: { customer: { name: string; phone: string } | null; print: boolean }) => void }) {
  const [method, setMethod] = useState<'cash' | 'upi' | 'card'>('upi');
  const [tip, setTip] = useState(0);
  const [print, setPrint] = useState(true);
  const [showCust, setShowCust] = useState(false);
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const customer = custName.trim() || custPhone.trim() ? { name: custName.trim(), phone: custPhone.trim() } : null;
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
        {(['upi', 'cash', 'card'] as const).map((m) => {
          const PI = PAY_ICON[m];
          return (
            <button key={m} onClick={() => setMethod(m)} aria-pressed={method === m} className="flex flex-col items-center gap-1.5 py-3.5 rounded-[14px] border-[1.5px] font-bold text-[12.5px]"
              style={method === m ? { background: 'color-mix(in srgb, var(--turmeric) 14%, var(--paper-3))', borderColor: 'var(--turmeric)', color: 'var(--turmeric-d)' } : { background: 'var(--paper)', borderColor: 'var(--line)', color: 'var(--ink-2)' }}>
              <PI size={22} aria-hidden />{m.toUpperCase()}
            </button>
          );
        })}
      </div>
      <div className="grid place-items-center py-[22px] min-h-[120px]">
        {method === 'upi' && <div className="text-center"><div className="w-[130px] h-[130px] mx-auto rounded-[14px] grid place-items-center" style={{ background: '#fff', boxShadow: 'var(--sh-2)' }}><QrCode size={86} color="#111" aria-hidden /></div><p className="mt-2 text-sm font-bold">Scan UPI QR · {formatINR(total + tip)}</p></div>}
        {method === 'cash' && <p className="font-bold">Collect {formatINR(total + tip)} in cash</p>}
        {method === 'card' && <p className="font-bold">Tap / insert card on terminal…</p>}
      </div>

      {/* customer details (optional) */}
      <div className="px-[22px] pb-1">
        {!showCust ? (
          <button onClick={() => setShowCust(true)} className="w-full py-2.5 rounded-[12px] border border-dashed font-bold text-[13px]"
            style={{ borderColor: 'var(--line)', color: 'var(--ink-2)', background: 'var(--paper)' }}>
            ＋ Add customer details (optional)
          </button>
        ) : (
          <div className="rounded-[14px] border p-3" style={{ borderColor: 'var(--line)', background: 'var(--paper)' }}>
            <div className="flex items-center mb-2">
              <span className="font-bold text-[13px]" style={{ color: 'var(--ink-2)' }}>Customer details</span>
              <button onClick={() => { setShowCust(false); setCustName(''); setCustPhone(''); }} className="ml-auto text-xs font-bold" style={{ color: 'var(--ink-3)' }}>Remove</button>
            </div>
            <input value={custName} onChange={(e) => setCustName(e.target.value)} placeholder="Name"
              className="w-full mb-2 px-3 py-2 rounded-[10px] border text-sm" style={{ borderColor: 'var(--line)', background: 'var(--paper-2)' }} />
            <input value={custPhone} onChange={(e) => setCustPhone(e.target.value)} placeholder="Phone" inputMode="tel"
              className="w-full px-3 py-2 rounded-[10px] border text-sm" style={{ borderColor: 'var(--line)', background: 'var(--paper-2)' }} />
          </div>
        )}
      </div>

      {/* print receipt toggle */}
      <label className="flex items-center gap-2.5 px-[22px] py-3 cursor-pointer select-none">
        <input type="checkbox" checked={print} onChange={(e) => setPrint(e.target.checked)} className="w-[18px] h-[18px] accent-[var(--turmeric)]" />
        <span className="inline-flex items-center gap-1.5 font-bold text-[13px]" style={{ color: 'var(--ink-2)' }}><Printer size={15} aria-hidden /> Print receipt after payment</span>
      </label>

      <button disabled={busy} onClick={() => onConfirm(method, tip, { customer, print })} className="btn btn-primary block m-[22px]" style={{ width: 'calc(100% - 44px)' }}>
        {busy ? 'Saving…' : `Confirm payment · ${formatINR(total + tip)}`}
      </button>
    </Modal>
  );
}
