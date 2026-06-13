/* =========================================================================
   Cafe OS — Kitchen Display System (dark roast)
   Live ticket queue, oldest-first, station filter, escalating timers, bump.
   Subscribes to the shared store; reacts to orders placed on the POS.
   ========================================================================= */
CAFE.KDS = (() => {
  let root, station = 'all', tick, unsub = [];

  function mount(stage) {
    root = document.createElement('div');
    root.className = 'kds';
    root.innerHTML = `
      <div class="kds-bar">
        <div class="kds-title"><span class="kds-live"></span> Kitchen Display <em>· ${CAFE.outlet.name}</em></div>
        <div class="kds-filter" id="kdsFilter">
          ${['all','kitchen','bar','dessert'].map(s => `<button data-s="${s}" class="${s==='all'?'on':''}">${s[0].toUpperCase()+s.slice(1)}</button>`).join('')}
        </div>
        <div class="kds-stats" id="kdsStats"></div>
      </div>
      <div class="kds-grid" id="kdsGrid"></div>
      <div class="kds-hint" id="kdsHint">No live tickets. Place an order on the <b>POS</b> → it appears here instantly. Tap a card to bump it forward.</div>`;
    stage.appendChild(root);

    root.querySelector('#kdsFilter').addEventListener('click', e => {
      const b = e.target.closest('[data-s]'); if (!b) return;
      station = b.dataset.s;
      root.querySelectorAll('#kdsFilter button').forEach(x => x.classList.toggle('on', x === b));
      render();
    });
    root.querySelector('#kdsGrid').addEventListener('click', e => {
      const card = e.target.closest('[data-bump]'); if (!card) return;
      CAFE.store.bump(card.dataset.bump);
      card.classList.add('bumped');
    });

    unsub.push(CAFE.bus.on('orders:changed', render));
    unsub.push(CAFE.bus.on('order:new', () => { ping(); render(); }));
    render();
    tick = setInterval(tickTimers, 1000);
    // cleanup when surface changes
    const obs = new MutationObserver(() => { if (!document.body.contains(root)) { clearInterval(tick); unsub.forEach(u => u()); obs.disconnect(); } });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  function visibleOrders() {
    let o = CAFE.store.activeForKDS();
    if (station !== 'all') o = o.filter(x => x.lines.some(l => l.station === station));
    return o.slice().sort((a, b) => a.placedAt - b.placedAt); // oldest first
  }

  function render() {
    if (!root) return;
    const orders = visibleOrders();
    const grid = root.querySelector('#kdsGrid');
    root.querySelector('#kdsHint').style.display = orders.length ? 'none' : '';
    grid.innerHTML = orders.map(o => {
      const lines = station === 'all' ? o.lines : o.lines.filter(l => l.station === station);
      return `
      <div class="ticket" data-bump="${o.id}" data-id="${o.id}" data-placed="${o.placedAt}">
        <div class="ticket-top">
          <span class="ticket-no">#${o.number}</span>
          <span class="ticket-tbl">${o.type === 'takeaway' ? '🥡 Takeaway' : 'Table ' + o.table}</span>
          <span class="ticket-timer mono">00:00</span>
        </div>
        <div class="ticket-items">
          ${lines.map(l => `
            <div class="ti-line">
              <span class="ti-qty">${l.qty}×</span>
              <span class="ti-name">${l.name}</span>
              ${l.station !== 'all' ? `<span class="ti-stn ${l.station}">${l.station}</span>` : ''}
              ${l.mods && l.mods.length ? `<span class="ti-mod">${l.mods.join(', ')}</span>` : ''}
            </div>`).join('')}
        </div>
        <div class="ticket-foot">
          <span class="ti-status ${o.status}">${o.status === 'placed' ? 'New' : 'Preparing'}</span>
          <span class="ti-bump">${o.status === 'placed' ? 'Start →' : 'Bump ✓'}</span>
        </div>
      </div>`;
    }).join('');
    const active = CAFE.store.activeForKDS();
    root.querySelector('#kdsStats').innerHTML = `
      <span class="kstat"><b>${active.length}</b> open</span>
      <span class="kstat"><b>${active.filter(o=>o.status==='placed').length}</b> new</span>`;
    tickTimers();
  }

  function tickTimers() {
    if (!root) return;
    root.querySelectorAll('.ticket').forEach(card => {
      const placed = +card.dataset.placed;
      const secs = Math.floor((Date.now() - placed) / 1000);
      const mm = String(Math.floor(secs / 60)).padStart(2, '0');
      const ss = String(secs % 60).padStart(2, '0');
      const t = card.querySelector('.ticket-timer');
      t.textContent = `${mm}:${ss}`;
      card.classList.remove('warn', 'late');
      if (secs > 300) card.classList.add('late');
      else if (secs > 120) card.classList.add('warn');
    });
  }

  function ping() {
    // brief audio-less visual pulse on the live dot
    const d = root && root.querySelector('.kds-live');
    if (d) { d.style.animation = 'none'; void d.offsetWidth; d.style.animation = ''; }
  }

  return { mount };
})();
