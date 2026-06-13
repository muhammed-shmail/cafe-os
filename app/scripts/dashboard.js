/* =========================================================================
   Cafe OS — Owner Dashboard (bento, calm but data-dense)
   AI morning briefing, live KPIs, sales chart, menu-engineering quadrant,
   inventory alerts, and a mini AI Sales Assistant chat.
   Counts live orders placed during the demo into "today".
   ========================================================================= */
CAFE.DASH = (() => {
  let root, unsub = [], A = CAFE.analytics;
  let liveOrders = 0, liveSales = 0;

  function mount(stage) {
    root = document.createElement('div');
    root.className = 'dash';
    root.innerHTML = `
      <aside class="dash-side">
        <div class="ds-store"><span class="brand-mark" style="font-size:18px">◐</span><div><b>${CAFE.outlet.name}</b><span>${CAFE.outlet.tagline.split('·')[1] || 'Owner'}</span></div></div>
        <nav class="ds-nav">
          ${[['◉','Overview','on'],['📈','Sales & Analytics',''],['📦','Inventory',''],['👥','Staff',''],['🎮','Loyalty & Games',''],['📣','Marketing',''],['🤖','AI Assistants',''],['☰','Menu',''],['⚙','Settings','']]
            .map(([i,l,s])=>`<button class="${s}"><span>${i}</span>${l}</button>`).join('')}
        </nav>
        <div class="ds-plan"><b>Growth plan</b><span>14 days left in trial</span><button class="btn primary" style="margin-top:8px;padding:8px">Upgrade</button></div>
      </aside>

      <main class="dash-main">
        <header class="dash-head">
          <div><h2>Good morning, Ravi ☀️</h2><span>Wednesday, 11 June · ${CAFE.outlet.name}</span></div>
          <div class="dash-head-r">
            <span class="pill ok"><span class="dot"></span> Live</span>
            <select class="outlet-sel"><option>Koramangala</option><option>Indiranagar</option><option>All outlets</option></select>
          </div>
        </header>

        <div class="bento">
          <!-- AI briefing -->
          <section class="bento-card briefing span-2">
            <div class="bc-head"><span class="bc-ai">✦ AI Morning Briefing</span><span class="bc-time">generated 7:02 AM</span></div>
            <div class="briefs">
              ${A.briefing.map(b => `
                <div class="brief ${b.tone}">
                  <span class="brief-ic">${b.tone==='up'?'▲':b.tone==='warn'?'!':'✦'}</span>
                  <p>${b.text}</p>
                  <button class="brief-act">${b.action} →</button>
                </div>`).join('')}
            </div>
          </section>

          <!-- KPIs -->
          <section class="bento-card kpi" id="kpiSales"><span class="kpi-l">Today’s sales</span><span class="kpi-n mono" id="kSales">${CAFE.fmt.inr(A.todaySales)}</span><span class="kpi-d up">▲ 18% vs last Wed</span></section>
          <section class="bento-card kpi" id="kpiOrders"><span class="kpi-l">Orders</span><span class="kpi-n mono" id="kOrders">${A.todayOrders}</span><span class="kpi-d up">▲ 12 live now</span></section>
          <section class="bento-card kpi"><span class="kpi-l">Avg order value</span><span class="kpi-n mono">${CAFE.fmt.inr(A.aov)}</span><span class="kpi-d up">▲ ₹24 from upsell</span></section>
          <section class="bento-card kpi"><span class="kpi-l">Footfall</span><span class="kpi-n mono">${A.footfall}</span><span class="kpi-d">QR scans 38%</span></section>

          <!-- sales chart -->
          <section class="bento-card chart span-2">
            <div class="bc-head"><h4>Orders · last 7 days</h4><span class="bc-time">peak 5–7pm</span></div>
            <div class="bars">
              ${A.salesTrend.map((v,i)=>`<div class="bar-col"><div class="bar" style="height:${v/Math.max(...A.salesTrend)*100}%"><span>${v}</span></div><em>${['Th','Fr','Sa','Su','Mo','Tu','We'][i]}</em></div>`).join('')}
            </div>
          </section>

          <!-- hourly heatmap -->
          <section class="bento-card heat span-2">
            <div class="bc-head"><h4>Hour-of-day heatmap</h4></div>
            <div class="heat-row">
              ${A.hourly.map((v,h)=>`<span class="heat-cell" style="--v:${v/Math.max(...A.hourly)}" title="${h}:00 · ${v} orders"></span>`).join('')}
            </div>
            <div class="heat-axis"><span>12a</span><span>6a</span><span>12p</span><span>6p</span><span>11p</span></div>
          </section>

          <!-- alerts -->
          <section class="bento-card alerts span-2">
            <div class="bc-head"><h4>⚠ Inventory alerts</h4><button class="bc-link">Reorder all</button></div>
            ${A.lowStock.map(s => `<div class="alert-row ${s.level}"><span class="al-dot"></span><b>${s.name}</b><span class="al-q mono">${s.qty}</span><span class="al-tag">${s.level}</span></div>`).join('')}
          </section>

          <!-- menu engineering quadrant -->
          <section class="bento-card quad span-2">
            <div class="bc-head"><h4>Menu engineering</h4><span class="bc-time">popularity × profit</span></div>
            <div class="quadrant">
              <span class="q-axis y">profit →</span><span class="q-axis x">popularity →</span>
              <span class="q-label tl">Puzzles</span><span class="q-label tr">⭐ Stars</span><span class="q-label bl">Dogs</span><span class="q-label br">Plowhorses</span>
              ${A.menuQuadrant.map(m => `<span class="q-dot ${m.q}" style="left:${m.pop}%;bottom:${m.profit}%" title="${m.name}"><em>${m.name}</em></span>`).join('')}
            </div>
          </section>

          <!-- AI assistant chat -->
          <section class="bento-card assistant span-2">
            <div class="bc-head"><span class="bc-ai">🤖 Sales Assistant</span><span class="bc-time">Claude · Opus 4.8</span></div>
            <div class="chat" id="chat">
              <div class="msg ai">Ask me anything — “why are sales down?”, “what should I promote tonight?”</div>
            </div>
            <div class="chat-suggest" id="suggest">
              <button data-q="Why were sales up today?">Why up today?</button>
              <button data-q="What should I promote tonight?">Promote tonight?</button>
              <button data-q="Who should I win back?">Win-back?</button>
            </div>
            <div class="chat-input"><input id="chatIn" placeholder="Ask the assistant…"><button id="chatSend">↑</button></div>
          </section>

          <!-- loyalty snapshot -->
          <section class="bento-card loyalty-mini span-2">
            <div class="bc-head"><h4>🎮 Engagement engine</h4></div>
            <div class="lm-grid">
              <div><span class="lm-n mono">34%</span><em>QR scan rate</em></div>
              <div><span class="lm-n mono">+15%</span><em>repeat visits</em></div>
              <div><span class="lm-n mono">412</span><em>games played</em></div>
              <div><span class="lm-n mono">₹1.2L</span><em>point liability</em></div>
            </div>
          </section>
        </div>
      </main>`;
    stage.appendChild(root);

    // nav cosmetic
    root.querySelector('.ds-nav').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      root.querySelectorAll('.ds-nav button').forEach(x => x.classList.remove('on')); b.classList.add('on');
      if (!b.classList.contains('cur')) CAFE.toast(b.textContent.trim() + ' — demo shows Overview', { emoji: '🚧' });
    });
    root.querySelectorAll('.brief-act, .bc-link').forEach(b => b.onclick = () => CAFE.toast('Action queued: ' + b.textContent.replace('→','').trim(), { kind: 'win', emoji: '✓' }));

    // AI chat
    const chat = root.querySelector('#chat'), input = root.querySelector('#chatIn');
    function ask(q) {
      if (!q.trim()) return;
      chat.insertAdjacentHTML('beforeend', `<div class="msg me">${q}</div>`);
      input.value = '';
      const typing = document.createElement('div'); typing.className = 'msg ai typing'; typing.innerHTML = '<i></i><i></i><i></i>';
      chat.appendChild(typing); chat.scrollTop = chat.scrollHeight;
      setTimeout(() => { typing.remove(); chat.insertAdjacentHTML('beforeend', `<div class="msg ai">${answer(q)}</div>`); chat.scrollTop = chat.scrollHeight; }, 900);
    }
    root.querySelector('#chatSend').onclick = () => ask(input.value);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') ask(input.value); });
    root.querySelector('#suggest').addEventListener('click', e => { const b = e.target.closest('[data-q]'); if (b) ask(b.dataset.q); });

    // live updates: count orders placed during the demo
    const onPay = ({ amount }) => { liveOrders++; liveSales += amount; bump(); };
    const onNew = (o) => { /* counts on settle via payment; show live order badge */ root.querySelector('#kOrders').textContent = A.todayOrders + liveOrders; };
    unsub.push(CAFE.bus.on('payment:done', onPay));
    unsub.push(CAFE.bus.on('order:new', onNew));
    function bump() {
      root.querySelector('#kSales').textContent = CAFE.fmt.inr(A.todaySales + liveSales);
      root.querySelector('#kOrders').textContent = A.todayOrders + liveOrders;
      root.querySelector('#kpiSales').classList.remove('flash'); void root.querySelector('#kpiSales').offsetWidth; root.querySelector('#kpiSales').classList.add('flash');
    }

    const obs = new MutationObserver(() => { if (!document.body.contains(root)) { unsub.forEach(u => u()); obs.disconnect(); } });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  function answer(q) {
    q = q.toLowerCase();
    if (q.includes('up') || q.includes('why'))
      return `Sales are <b>₹12,400 ahead</b> of last Wednesday. The driver is the <b>5–7pm window</b> (+38 orders), led by <b>Spanish Latte</b> and <b>Paneer Roll</b>. QR scan rate hit 38%, and game-won add-ons lifted AOV by ₹24. <span class="msg-act">Suggested: extend happy-hour pricing 1 hour.</span>`;
    if (q.includes('promote') || q.includes('tonight'))
      return `Feature the <b>Tiramisu Jar</b> — it's a <b>Puzzle</b> (82% margin, low orders). Push it on the PWA home + a “win a free Tiramisu” wheel segment for tonight's diners. Pair with Cold Brew to revive a <b>Dog</b>. <span class="msg-act">I can draft the PWA banner + WhatsApp.</span>`;
    if (q.includes('win') || q.includes('back') || q.includes('lapsed'))
      return `<b>14 Gold customers</b> haven't visited in 21 days (avg spend ₹640). A ₹50 win-back coupon via WhatsApp typically recovers ~40% → <b>~₹9,000</b> expected. <span class="msg-act">Draft: “We miss you, Arjun ☕ Here's ₹50 — valid 7 days.”</span>`;
    return `Based on today's data: footfall ${A.footfall}, AOV ${CAFE.fmt.inr(A.aov)}, repeat-rate +15%. Try asking about <b>sales</b>, <b>what to promote</b>, or <b>win-back</b>.`;
  }

  return { mount };
})();
