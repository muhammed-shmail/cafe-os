/* =========================================================================
   Cafe OS — Tablet POS surface
   Landscape three-pane: categories · item grid · cart/ticket.
   Sends orders into the shared store (-> KDS + PWA + dashboard).
   ========================================================================= */
CAFE.POS = (() => {
  let root, cart = [], activeCat = 'coffee', table = null, orderType = 'dine_in';
  let discountPct = 0, scPct = 0;

  const fmt = CAFE.fmt.inr;

  function mount(stage) {
    root = document.createElement('div');
    root.className = 'pos';
    root.innerHTML = `
      <aside class="pos-rail">
        <div class="pos-rail-head">
          <span class="pos-store">◐ ${CAFE.outlet.name}</span>
          <span class="pill ok" style="font-size:11px"><span class="dot"></span> Counter 1 · Priya</span>
        </div>
        <div class="type-toggle" id="typeToggle">
          <button data-type="dine_in" class="on">Dine-in</button>
          <button data-type="takeaway">Takeaway</button>
        </div>
        <div class="cat-list" id="catList"></div>
        <button class="floor-btn" id="floorBtn">⊞ Floor map &amp; tables</button>
        <div class="pos-rail-foot">
          <span class="pill" style="font-size:11px">⚡ Offline-ready</span>
          <span class="mono" style="font-size:11px;color:var(--ink-3)">v1 · MVP</span>
        </div>
      </aside>

      <section class="pos-menu">
        <div class="pos-menu-head">
          <h2 id="catTitle">Coffee</h2>
          <div class="pos-search"><span>⌕</span><input id="posSearch" placeholder="Search the menu…"></div>
        </div>
        <div class="item-grid" id="itemGrid"></div>
      </section>

      <aside class="pos-cart card">
        <div class="cart-head">
          <div>
            <h3>Current ticket</h3>
            <span class="cart-table" id="cartTable">Takeaway</span>
          </div>
          <button class="cart-clear" id="cartClear" title="Clear">⟲</button>
        </div>
        <div class="cart-lines" id="cartLines"></div>
        <div class="cart-totals" id="cartTotals"></div>
        <div class="cart-actions">
          <button class="btn dark" id="sendKot">Send to KOT</button>
          <button class="btn primary" id="charge">Charge →</button>
        </div>
      </aside>`;
    stage.appendChild(root);

    renderCats(); renderItems(); renderCart(); pickTable(null);

    root.querySelector('#catList').addEventListener('click', e => {
      const b = e.target.closest('[data-cat]'); if (!b) return;
      activeCat = b.dataset.cat; renderCats(); renderItems();
    });
    root.querySelector('#itemGrid').addEventListener('click', e => {
      const b = e.target.closest('[data-item]'); if (!b) return;
      const item = CAFE.menu.find(m => m.id === b.dataset.item);
      if (CAFE.modifiers[item.cat]) openModSheet(item); else addToCart(item, [], 0);
    });
    root.querySelector('#typeToggle').addEventListener('click', e => {
      const b = e.target.closest('[data-type]'); if (!b) return;
      orderType = b.dataset.type;
      root.querySelectorAll('#typeToggle button').forEach(x => x.classList.toggle('on', x === b));
      if (orderType === 'takeaway') { table = null; }
      renderCart();
    });
    root.querySelector('#posSearch').addEventListener('input', e => renderItems(e.target.value.trim().toLowerCase()));
    root.querySelector('#cartClear').onclick = () => { cart = []; discountPct = 0; scPct = 0; renderCart(); };
    root.querySelector('#floorBtn').onclick = openFloor;
    root.querySelector('#sendKot').onclick = sendToKot;
    root.querySelector('#charge').onclick = openCharge;
  }

  function renderCats() {
    root.querySelector('#catList').innerHTML = CAFE.categories.map(c => `
      <button data-cat="${c.id}" class="cat ${c.id === activeCat ? 'on' : ''}">
        <span class="cat-ic">${c.icon}</span><span>${c.name}</span>
        <span class="cat-n">${CAFE.menu.filter(m => m.cat === c.id).length}</span>
      </button>`).join('');
  }

  function renderItems(q = '') {
    const cat = CAFE.categories.find(c => c.id === activeCat);
    root.querySelector('#catTitle').textContent = cat.name;
    let items = CAFE.menu.filter(m => m.cat === activeCat);
    if (q) items = CAFE.menu.filter(m => m.name.toLowerCase().includes(q));
    root.querySelector('#itemGrid').innerHTML = items.map(m => `
      <button data-item="${m.id}" class="m-card">
        ${m.tags.includes('bestseller') ? '<span class="m-best">★ Bestseller</span>' : ''}
        <div class="m-emoji">${m.emoji}</div>
        <div class="m-name">${m.name}</div>
        <div class="m-foot">
          <span class="m-price mono">${fmt(m.price)}</span>
          <span class="m-veg ${m.tags.includes('nonveg') ? 'nv' : m.tags.includes('egg') ? 'egg' : ''}"></span>
        </div>
        <span class="m-gst">GST ${m.gst}%</span>
      </button>`).join('') || `<div class="empty">No items match.</div>`;
  }

  /* ---- modifier bottom-sheet -------------------------------------- */
  function openModSheet(item) {
    const groups = CAFE.modifiers[item.cat];
    const sel = groups.map(g => 0); // default first option each
    const back = el('div', 'modal-back');
    function priceNow() { return item.price + groups.reduce((a, g, i) => a + g.opts[sel[i]].p, 0); }
    function render() {
      back.querySelector('.mod-price').textContent = fmt(priceNow());
      back.querySelectorAll('.mod-opt').forEach(o => {
        const gi = +o.dataset.g, oi = +o.dataset.o;
        o.classList.toggle('on', sel[gi] === oi);
      });
    }
    back.innerHTML = `
      <div class="modal mod-sheet">
        <div class="mod-head"><span class="m-emoji sm">${item.emoji}</span>
          <div><h3>${item.name}</h3><span class="mono" style="color:var(--ink-3)">Customise</span></div>
          <button class="x" data-x>×</button></div>
        <div class="mod-body">
          ${groups.map((g, gi) => `
            <div class="mod-group"><div class="mod-glabel">${g.group}</div>
              <div class="mod-opts">
                ${g.opts.map((o, oi) => `<button class="mod-opt ${oi === 0 ? 'on' : ''}" data-g="${gi}" data-o="${oi}">${o.n}</button>`).join('')}
              </div></div>`).join('')}
        </div>
        <div class="mod-foot">
          <span class="mod-price mono">${fmt(item.price)}</span>
          <button class="btn primary" data-add>Add to ticket</button>
        </div>
      </div>`;
    back.addEventListener('click', e => {
      if (e.target === back || e.target.closest('[data-x]')) return back.remove();
      const opt = e.target.closest('.mod-opt');
      if (opt) { sel[+opt.dataset.g] = +opt.dataset.o; render(); }
      if (e.target.closest('[data-add]')) {
        const mods = groups.map((g, i) => g.opts[sel[i]]).filter(o => o.n !== 'Regular' && o.n !== 'Single' && o.n !== 'Normal' && o.n !== 'None' && o.n !== 'Mild');
        addToCart(item, mods.map(m => m.n), groups.reduce((a, g, i) => a + g.opts[sel[i]].p, 0));
        back.remove();
      }
    });
    document.body.appendChild(back);
  }

  function addToCart(item, mods, modTotal) {
    const key = item.id + '|' + mods.join(',');
    const ex = cart.find(l => l.key === key);
    if (ex) ex.qty++;
    else cart.push({ key, id: item.id, name: item.name, emoji: item.emoji, price: item.price, gst: item.gst, station: item.station, mods, modTotal, qty: 1 });
    renderCart(true);
  }

  function renderCart(flash) {
    const t = root.querySelector('#cartTable');
    t.textContent = orderType === 'takeaway' ? 'Takeaway' : (table ? 'Table ' + table : 'Pick a table');
    t.classList.toggle('warn', orderType === 'dine_in' && !table);

    const lines = root.querySelector('#cartLines');
    if (!cart.length) {
      lines.innerHTML = `<div class="cart-empty"><div class="ce-glyph">☕</div><p>Tap items to build the ticket.</p></div>`;
    } else {
      lines.innerHTML = cart.map(l => `
        <div class="c-line ${flash ? 'flash' : ''}">
          <div class="c-line-main">
            <span class="c-emoji">${l.emoji}</span>
            <div><div class="c-name">${l.name}</div>${l.mods.length ? `<div class="c-mods">${l.mods.join(' · ')}</div>` : ''}</div>
          </div>
          <div class="c-qty">
            <button data-dec="${l.key}">−</button><span>${l.qty}</span><button data-inc="${l.key}">+</button>
          </div>
          <span class="c-amt mono">${fmt((l.price + l.modTotal) * l.qty)}</span>
        </div>`).join('');
    }
    lines.querySelectorAll('[data-inc]').forEach(b => b.onclick = () => { cart.find(l => l.key === b.dataset.inc).qty++; renderCart(); });
    lines.querySelectorAll('[data-dec]').forEach(b => b.onclick = () => { const l = cart.find(x => x.key === b.dataset.dec); l.qty--; if (l.qty <= 0) cart = cart.filter(x => x !== l); renderCart(); });

    const tot = CAFE.gst.compute(cart, { discountPct, serviceChargePct: scPct });
    root.querySelector('#cartTotals').innerHTML = !cart.length ? '' : `
      <div class="t-row"><span>Subtotal</span><span class="mono">${fmt(tot.subtotal)}</span></div>
      ${discountPct ? `<div class="t-row disc"><span>Discount (${discountPct}%)</span><span class="mono">− ${fmt(tot.discount)}</span></div>` : ''}
      <div class="t-row sub"><span>CGST</span><span class="mono">${fmt(tot.cgst)}</span></div>
      <div class="t-row sub"><span>SGST</span><span class="mono">${fmt(tot.sgst)}</span></div>
      ${scPct ? `<div class="t-row"><span>Service charge</span><span class="mono">${fmt(tot.serviceCharge)}</span></div>` : ''}
      <div class="t-row sub"><span>Round-off</span><span class="mono">${tot.roundOff >= 0 ? '+' : '−'} ${fmt(Math.abs(tot.roundOff))}</span></div>
      <div class="t-row grand"><span>Total</span><span class="mono">${fmt(tot.total)}</span></div>
      <div class="disc-chips">
        ${[0,5,10].map(d => `<button class="dchip ${d===discountPct?'on':''}" data-disc="${d}">${d ? d+'% off' : 'No disc.'}</button>`).join('')}
        <button class="dchip ${scPct?'on':''}" data-sc>+SC 5%</button>
      </div>`;
    root.querySelectorAll('[data-disc]').forEach(b => b.onclick = () => { discountPct = +b.dataset.disc; renderCart(); });
    const scBtn = root.querySelector('[data-sc]'); if (scBtn) scBtn.onclick = () => { scPct = scPct ? 0 : 5; renderCart(); };

    root.querySelector('#sendKot').disabled = !cart.length;
    root.querySelector('#charge').disabled = !cart.length;
  }

  /* ---- floor map -------------------------------------------------- */
  function openFloor() {
    const back = el('div', 'modal-back');
    back.innerHTML = `
      <div class="modal floor">
        <div class="mod-head"><div><h3>Floor map</h3><span class="mono" style="color:var(--ink-3)">Pick a table</span></div><button class="x" data-x>×</button></div>
        <div class="floor-grid">
          ${CAFE.tables.map(t => `
            <button class="tbl ${t.state} ${t.id===table?'on':''}" data-t="${t.id}">
              <span class="tbl-id">${t.id}</span>
              <span class="tbl-seats">${'•'.repeat(t.seats)}</span>
              <span class="tbl-state">${t.state}</span>
            </button>`).join('')}
        </div>
        <div class="floor-legend"><span><i class="lg free"></i>Free</span><span><i class="lg seated"></i>Seated</span><span><i class="lg billed"></i>Billed</span></div>
      </div>`;
    back.addEventListener('click', e => {
      if (e.target === back || e.target.closest('[data-x]')) return back.remove();
      const b = e.target.closest('[data-t]');
      if (b) { pickTable(b.dataset.t); orderType = 'dine_in'; root.querySelectorAll('#typeToggle button').forEach(x => x.classList.toggle('on', x.dataset.type === 'dine_in')); renderCart(); back.remove(); }
    });
    document.body.appendChild(back);
  }
  function pickTable(id) { table = id; renderCart(); }

  /* ---- send to KOT ------------------------------------------------ */
  function sendToKot() {
    if (!cart.length) return;
    if (orderType === 'dine_in' && !table) { CAFE.toast('Pick a table first', { kind: '', emoji: '⚠️' }); openFloor(); return; }
    const tot = CAFE.gst.compute(cart, { discountPct, serviceChargePct: scPct });
    const order = CAFE.store.createOrder({ table: orderType === 'takeaway' ? 'TA' : table, type: orderType, lines: cart.map(l => ({ ...l })), totals: tot });
    CAFE.toast(`KOT #${order.number} sent to kitchen`, { kind: 'win', emoji: '🧾' });
    cart = []; discountPct = 0; scPct = 0; renderCart();
  }

  /* ---- charge flow ------------------------------------------------ */
  function openCharge() {
    if (!cart.length) return;
    if (orderType === 'dine_in' && !table) { CAFE.toast('Pick a table first', { emoji: '⚠️' }); openFloor(); return; }
    const tot = CAFE.gst.compute(cart, { discountPct, serviceChargePct: scPct });
    let method = 'upi', tip = 0, split = false;
    const back = el('div', 'modal-back');
    function render() {
      back.querySelector('.pay-methods').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.m === method));
      back.querySelector('.pay-grand').textContent = fmt(tot.total + tip);
      const body = back.querySelector('.pay-detail');
      if (method === 'upi') body.innerHTML = `<div class="upi-qr"><div class="qr">${qrSvg()}</div><p>Scan with any UPI app</p><span class="mono">${CAFE.outlet.name} · ${fmt(tot.total + tip)}</span></div>`;
      else if (method === 'cash') body.innerHTML = `<div class="cash-pad"><p>Cash tendered</p><div class="cash-quick">${[tot.total, roundUp(tot.total,10000), roundUp(tot.total,20000), 50000].map(c=>`<button class="dchip" data-cash="${c}">${fmt(c)}</button>`).join('')}</div><div class="cash-change" id="cashChange">Exact change</div></div>`;
      else if (method === 'card') body.innerHTML = `<div class="card-wait"><div class="card-pulse">💳</div><p>Insert / tap card on the terminal…</p></div>`;
      else body.innerHTML = `<div class="split-box"><p>Split equally</p><div class="split-ways">${[2,3,4].map(n=>`<button class="dchip" data-split="${n}">${n} ways · ${fmt(Math.ceil((tot.total+tip)/n/100)*100)}</button>`).join('')}</div></div>`;
      body.querySelectorAll('[data-cash]').forEach(b => b.onclick = () => { const c = +b.dataset.cash; back.querySelector('#cashChange').textContent = c >= tot.total ? 'Return ' + fmt(c - tot.total) : 'Insufficient'; });
    }
    back.innerHTML = `
      <div class="modal pay">
        <div class="mod-head"><div><h3>Charge ${orderType==='takeaway'?'Takeaway':'Table '+table}</h3><span class="mono" style="color:var(--ink-3)">${cart.reduce((a,l)=>a+l.qty,0)} items</span></div><button class="x" data-x>×</button></div>
        <div class="pay-amount"><span>Amount due</span><span class="pay-grand mono">${fmt(tot.total)}</span></div>
        <div class="tip-row"><span>Add tip</span>${[0,2000,5000,10000].map(tp=>`<button class="dchip ${tp===0?'on':''}" data-tip="${tp}">${tp?fmt(tp):'No tip'}</button>`).join('')}</div>
        <div class="pay-methods">
          <button data-m="upi" class="on"><span>📲</span>UPI / QR</button>
          <button data-m="cash"><span>💵</span>Cash</button>
          <button data-m="card"><span>💳</span>Card</button>
          <button data-m="split"><span>⑂</span>Split</button>
        </div>
        <div class="pay-detail"></div>
        <button class="btn primary block lg" data-done>Confirm payment · <span class="pay-grand2">${fmt(tot.total)}</span></button>
      </div>`;
    render();
    back.addEventListener('click', e => {
      if (e.target === back || e.target.closest('[data-x]')) return back.remove();
      const m = e.target.closest('[data-m]'); if (m) { method = m.dataset.m; render(); }
      const tp = e.target.closest('[data-tip]'); if (tp) { tip = +tp.dataset.tip; back.querySelectorAll('[data-tip]').forEach(x=>x.classList.toggle('on',x===tp)); back.querySelector('.pay-grand2').textContent = fmt(tot.total+tip); render(); }
      if (e.target.closest('[data-done]')) {
        const order = CAFE.store.createOrder({ table: orderType === 'takeaway' ? 'TA' : table, type: orderType, lines: cart.map(l => ({ ...l })), totals: tot });
        back.remove();
        CAFE.confetti();
        CAFE.toast(`Paid ${fmt(tot.total + tip)} · ${method.toUpperCase()}`, { kind: 'win', emoji: '✅' });
        cart = []; discountPct = 0; scPct = 0; renderCart();
        // simulate digital receipt + points to PWA
        CAFE.bus.emit('payment:done', { order, method, amount: tot.total + tip });
      }
    });
    document.body.appendChild(back);
  }

  function roundUp(p, step) { return Math.ceil(p / step) * step; }
  function qrSvg() {
    // decorative deterministic QR-ish grid
    let cells = '';
    for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) {
      const on = ((x * 7 + y * 13 + x * y) % 3 === 0) || (x < 3 && y < 3) || (x > 7 && y < 3) || (x < 3 && y > 7);
      if (on) cells += `<rect x="${x*9}" y="${y*9}" width="8" height="8" rx="1.5"/>`;
    }
    return `<svg viewBox="0 0 99 99" fill="var(--ink)">${cells}</svg>`;
  }

  function el(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }
  return { mount };
})();
