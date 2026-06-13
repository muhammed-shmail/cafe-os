/* =========================================================================
   Cafe OS — Shared store + event bus.
   This is the spine that makes the "magic loop" feel alive: an order placed
   on the POS emits events that the KDS and the customer PWA both react to,
   and that the dashboard counts. All money is integer paise.
   ========================================================================= */
window.CAFE = window.CAFE || {};

/* ---- tiny event bus ------------------------------------------------ */
CAFE.bus = (() => {
  const map = {};
  return {
    on(evt, fn) { (map[evt] = map[evt] || []).push(fn); return () => CAFE.bus.off(evt, fn); },
    off(evt, fn) { map[evt] = (map[evt] || []).filter(f => f !== fn); },
    emit(evt, payload) { (map[evt] || []).forEach(f => { try { f(payload); } catch (e) { console.error(e); } }); },
  };
})();

/* ---- money helpers ------------------------------------------------- */
CAFE.fmt = {
  inr(paise) {
    const r = (paise / 100);
    return '₹' + r.toLocaleString('en-IN', { minimumFractionDigits: r % 1 ? 2 : 0, maximumFractionDigits: 2 });
  },
  inrPlain(paise) { return (paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); },
};

/* ---- GST engine (intra-state -> CGST+SGST split) ------------------- */
CAFE.gst = {
  /* lines: [{ price, gst, qty, modTotal }] ; returns paise breakdown */
  compute(lines, { discountPct = 0, serviceChargePct = 0 } = {}) {
    let subtotal = 0, taxByRate = {};
    lines.forEach(l => {
      const gross = (l.price + (l.modTotal || 0)) * l.qty;
      subtotal += gross;
    });
    const discount = Math.round(subtotal * discountPct / 100);
    const taxable = subtotal - discount;
    // distribute discount proportionally, compute tax per line
    let cgst = 0, sgst = 0;
    lines.forEach(l => {
      const gross = (l.price + (l.modTotal || 0)) * l.qty;
      const share = subtotal ? gross / subtotal : 0;
      const lineTaxable = gross - Math.round(discount * share);
      const tax = Math.round(lineTaxable * (l.gst / 100));
      cgst += Math.round(tax / 2);
      sgst += tax - Math.round(tax / 2);
      taxByRate[l.gst] = (taxByRate[l.gst] || 0) + tax;
    });
    const serviceCharge = Math.round(taxable * serviceChargePct / 100);
    const preRound = taxable + cgst + sgst + serviceCharge;
    const total = Math.round(preRound / 100) * 100; // round to nearest rupee
    const roundOff = total - preRound;
    return { subtotal, discount, taxable, cgst, sgst, serviceCharge, roundOff, total, taxByRate };
  },
};

/* ---- live order store ---------------------------------------------- */
CAFE.store = (() => {
  let orders = [];        // active orders across POS/KDS/PWA
  let seq = 101;
  let coins = CAFE.customer.coins;
  let points = CAFE.customer.points;

  const STAGES = ['placed', 'in_kitchen', 'ready', 'served'];

  function createOrder({ table, type, lines, totals, staff = 'Priya' }) {
    const order = {
      id: 'o' + Date.now(),
      number: seq++,
      table: table || 'TA',
      type: type || 'dine_in',
      lines: lines.map(l => ({ ...l, kot: 'queued' })),
      totals,
      staff,
      status: 'placed',
      placedAt: Date.now(),
      etaMin: Math.max(4, Math.min(12, Math.round(lines.reduce((a, l) => a + l.qty, 0) * 1.6) + 3)),
      progress: 0,
    };
    orders.unshift(order);
    CAFE.bus.emit('order:new', order);
    CAFE.bus.emit('orders:changed', orders);
    return order;
  }

  function advance(orderId, status) {
    const o = orders.find(x => x.id === orderId);
    if (!o) return;
    o.status = status;
    o.progress = { placed: 8, in_kitchen: 45, ready: 92, served: 100 }[status] || o.progress;
    if (status === 'in_kitchen') o.lines.forEach(l => l.kot = 'preparing');
    if (status === 'ready') o.lines.forEach(l => l.kot = 'ready');
    CAFE.bus.emit('order:status', o);
    CAFE.bus.emit('orders:changed', orders);
  }

  function bump(orderId) {
    const o = orders.find(x => x.id === orderId);
    if (!o) return;
    const next = o.status === 'placed' ? 'in_kitchen' : o.status === 'in_kitchen' ? 'ready' : 'served';
    advance(orderId, next);
  }

  function activeForKDS() { return orders.filter(o => ['placed', 'in_kitchen'].includes(o.status)); }
  function liveForPWA()   { return orders.find(o => o.status !== 'served') || orders[0]; }

  function addCoins(n)  { coins += n;  CAFE.bus.emit('loyalty:changed', { coins, points }); }
  function addPoints(n) { points += n; CAFE.bus.emit('loyalty:changed', { coins, points }); }
  function balance()    { return { coins, points }; }

  return { orders: () => orders, createOrder, advance, bump, activeForKDS, liveForPWA, addCoins, addPoints, balance, STAGES };
})();
