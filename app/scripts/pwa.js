/* =========================================================================
   Cafe OS — Customer PWA (the magic). Mobile-first, rendered in a phone frame.
   Tabs: Home · Menu · Play · Rewards · Profile.
   Signature flow: scan -> live order progress -> wait-time game -> earn -> upsell.
   ========================================================================= */
CAFE.PWA = (() => {
  let root, screen, tab = 'home', unsub = [], carouselTimer, progTimer;
  const C = CAFE.customer;
  let entIndex = 0;

  function mount(stage) {
    root = document.createElement('div');
    root.className = 'pwa-stage';
    root.innerHTML = `
      <div class="phone">
        <div class="phone-notch"></div>
        <div class="phone-screen" id="pwaScreen"></div>
        <nav class="pwa-nav" id="pwaNav">
          ${[['home','⌂','Home'],['menu','☰','Menu'],['play','◉','Play'],['rewards','★','Rewards'],['profile','◔','Profile']]
            .map(([k,i,l]) => `<button data-tab="${k}" class="${k===tab?'on':''}"><span>${i}</span>${l}</button>`).join('')}
        </nav>
      </div>
      <aside class="pwa-aside">
        <h3>The wait becomes play.</h3>
        <p>This is what your customer sees after scanning the table QR. It updates <b>live</b> from the kitchen.</p>
        <ol>
          <li>Place an order on the <b>POS</b> — the progress bar here starts moving.</li>
          <li><b>Bump</b> it on the Kitchen display — status jumps to “Ready”.</li>
          <li>Tap <b>Play</b> → spin the wheel → earn coins &amp; coupons while waiting.</li>
        </ol>
        <span class="pwa-scan">⛶ Scanned: Table T6 · ${CAFE.outlet.name}</span>
      </aside>`;
    stage.appendChild(root);
    screen = root.querySelector('#pwaScreen');

    root.querySelector('#pwaNav').addEventListener('click', e => {
      const b = e.target.closest('[data-tab]'); if (!b) return;
      tab = b.dataset.tab;
      root.querySelectorAll('#pwaNav button').forEach(x => x.classList.toggle('on', x === b));
      renderTab();
    });

    unsub.push(CAFE.bus.on('order:status', () => { if (tab === 'home') renderHome(); }));
    unsub.push(CAFE.bus.on('order:new', () => { if (tab === 'home') renderHome(); }));
    unsub.push(CAFE.bus.on('loyalty:changed', () => { if (tab === 'home' || tab === 'rewards' || tab === 'profile') renderTab(); }));
    renderTab();

    const obs = new MutationObserver(() => { if (!document.body.contains(root)) { clearInterval(carouselTimer); clearInterval(progTimer); unsub.forEach(u => u()); obs.disconnect(); } });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  function renderTab() {
    clearInterval(carouselTimer);
    ({ home: renderHome, menu: renderMenu, play: renderPlay, rewards: renderRewards, profile: renderProfile }[tab] || renderHome)();
  }

  /* ---- HOME ------------------------------------------------------- */
  function renderHome() {
    const bal = CAFE.store.balance();
    const order = CAFE.store.liveForPWA();
    const stages = [['placed','Order placed'],['in_kitchen','In the kitchen'],['ready','Ready to serve'],['served','Enjoy!']];
    const curIdx = order ? Math.max(0, stages.findIndex(s => s[0] === order.status)) : -1;
    const tierPct = Math.min(100, Math.round(C.points / C.nextTierAt * 100));

    screen.innerHTML = `
      <div class="pwa-scroll">
        <header class="pwa-top">
          <div><span class="pwa-hi">Hi ${C.name} 👋</span><span class="pwa-loc">${CAFE.outlet.name} · T6</span></div>
          <div class="pwa-tier"><span class="tier-ring" style="--p:${tierPct}"><b>${C.tier[0]}</b></span></div>
        </header>

        ${order ? `
        <section class="track card-glass">
          <div class="track-head">
            <span>${order.status === 'served' ? 'Served' : 'Your order'} · #${order.number}</span>
            <span class="track-eta mono">${order.status === 'ready' ? 'Ready now!' : order.status === 'served' ? '✓ Done' : '~' + order.etaMin + ' min'}</span>
          </div>
          <div class="track-bar"><i style="width:${{placed:18,in_kitchen:55,ready:90,served:100}[order.status]}%"></i></div>
          <div class="track-steps">
            ${stages.map((s, i) => `<div class="ts ${i<=curIdx?'done':''} ${i===curIdx?'cur':''}"><span class="ts-dot"></span><em>${s[1]}</em></div>`).join('')}
          </div>
          ${order.status !== 'served' ? `<button class="track-cta" data-tab-jump="play">⏳ Got ${order.etaMin} min? <b>Play &amp; earn →</b></button>` : ''}
        </section>` : `
        <section class="track card-glass empty-track">
          <div class="et-glyph">📲</div>
          <p>No live order yet.</p>
          <span>Place one on the <b>POS</b> surface and watch it appear here in real time.</span>
        </section>`}

        <section class="ent-carousel" id="entCarousel"></section>

        <section class="loyalty-snap">
          <div class="ls-card points"><span class="ls-n mono">${C.points.toLocaleString('en-IN')}</span><span class="ls-l">Points</span></div>
          <div class="ls-card coins"><span class="ls-n mono">${bal.coins}</span><span class="ls-l">Coins 🪙</span></div>
          <div class="ls-card streak"><span class="ls-n mono">${C.streak}🔥</span><span class="ls-l">Day streak</span></div>
        </section>

        <section class="offers">
          <h4>For you today</h4>
          <div class="offer-row">
            <div class="offer-card"><span class="of-emoji">🍫</span><div><b>Add a Brownie</b><span>₹99 · slip it in now</span></div><button class="of-add" data-upsell>Add</button></div>
            <div class="offer-card alt"><span class="of-emoji">🥛</span><div><b>Oat-milk upgrade</b><span>Free with Gold</span></div><button class="of-add ghost" data-claim>Claim</button></div>
          </div>
        </section>

        <div class="quick-actions">
          <button data-tab-jump="play"><span>◉</span>Play</button>
          <button data-tab-jump="menu"><span>☰</span>Menu</button>
          <button data-tab-jump="rewards"><span>★</span>Rewards</button>
          <button data-tab-jump="profile"><span>↗</span>Invite</button>
        </div>
      </div>`;

    startCarousel();
    screen.querySelectorAll('[data-tab-jump]').forEach(b => b.onclick = () => { tab = b.dataset.tabJump; root.querySelectorAll('#pwaNav button').forEach(x => x.classList.toggle('on', x.dataset.tab === tab)); renderTab(); });
    const up = screen.querySelector('[data-upsell]'); if (up) up.onclick = () => { up.textContent = '✓'; up.classList.add('added'); CAFE.toast('Brownie added to your order!', { kind: 'win', emoji: '🍫' }); };
    const cl = screen.querySelector('[data-claim]'); if (cl) cl.onclick = () => { cl.textContent = '✓'; CAFE.toast('Oat-milk upgrade claimed', { emoji: '🥛' }); };
  }

  function startCarousel() {
    const wrap = screen.querySelector('#entCarousel'); if (!wrap) return;
    function paint() {
      const e = CAFE.entertainment[entIndex % CAFE.entertainment.length];
      wrap.innerHTML = `
        <div class="ent-card ${e.kind}">
          <span class="ent-emoji">${e.emoji}</span>
          <div class="ent-body"><span class="ent-kind">${e.kind}</span><h5>${e.title}</h5><p>${e.body}</p></div>
          ${e.cta ? `<button class="ent-cta" data-ent-cta>${e.cta}</button>` : ''}
          <div class="ent-dots">${CAFE.entertainment.map((_,i)=>`<i class="${i===entIndex%CAFE.entertainment.length?'on':''}"></i>`).join('')}</div>
        </div>`;
      const c = wrap.querySelector('[data-ent-cta]'); if (c) c.onclick = () => CAFE.toast('Brownie added — ₹99', { kind: 'win', emoji: '🍫' });
    }
    paint();
    carouselTimer = setInterval(() => { entIndex++; paint(); }, 4200);
  }

  /* ---- MENU ------------------------------------------------------- */
  function renderMenu() {
    screen.innerHTML = `
      <div class="pwa-scroll">
        <header class="pwa-h"><h3>Menu</h3><span class="pwa-h-sub">Add to your live order</span></header>
        <div class="usual-card"><span>☕</span><div><b>Your usual</b><span>Spanish Latte · Oat · Double shot</span></div><button class="usual-add">Reorder</button></div>
        ${CAFE.categories.map(c => `
          <div class="pmenu-cat"><h5>${c.icon} ${c.name}</h5>
            ${CAFE.menu.filter(m => m.cat === c.id).slice(0,4).map(m => `
              <div class="pmenu-item">
                <span class="pm-emoji">${m.emoji}</span>
                <div class="pm-info"><b>${m.name}</b><span class="mono">${CAFE.fmt.inr(m.price)}</span></div>
                <button class="pm-add" data-add="${m.id}">+</button>
              </div>`).join('')}
          </div>`).join('')}
      </div>`;
    screen.querySelectorAll('[data-add]').forEach(b => b.onclick = () => { b.textContent = '✓'; b.classList.add('added'); CAFE.toast('Added to your order', { emoji: '🛒' }); setTimeout(()=>{b.textContent='+';b.classList.remove('added');}, 1400); });
    screen.querySelector('.usual-add').onclick = () => CAFE.toast('Your usual is on the way ☕', { kind: 'win' });
  }

  /* ---- PLAY (Spin the Wheel) -------------------------------------- */
  function renderPlay() {
    const bal = CAFE.store.balance();
    screen.innerHTML = `
      <div class="pwa-scroll play">
        <header class="pwa-h"><h3>Play &amp; earn</h3><span class="pwa-h-sub">${C.spinsLeft} spin left this visit</span></header>
        <div class="wheel-wrap">
          <div class="wheel-pointer">▼</div>
          <div class="wheel" id="wheel">${wheelSvg()}</div>
          <button class="spin-btn" id="spinBtn" ${C.spinsLeft<=0?'disabled':''}>${C.spinsLeft>0?'SPIN':'Come back tomorrow'}</button>
        </div>
        <div class="play-balance"><span class="mono">🪙 ${bal.coins} coins</span><span class="mono">★ ${C.points.toLocaleString('en-IN')} pts</span></div>
        <h4 class="games-h">More games</h4>
        <div class="games-grid">
          ${[['🎟️','Scratch card','Soon'],['🧠','Trivia','Soon'],['🃏','Memory','Soon'],['⚔️','Quiz Battle','Multiplayer']].map(([e,n,t])=>`
            <div class="game-tile locked"><span>${e}</span><b>${n}</b><em>${t}</em></div>`).join('')}
        </div>
        <p class="anti-cheat">🔒 Server-authoritative &amp; rate-limited · 1 spin per visit, device + phone bound.</p>
      </div>`;
    const btn = screen.querySelector('#spinBtn');
    if (btn && C.spinsLeft > 0) btn.onclick = doSpin;
  }

  function wheelSvg() {
    const segs = CAFE.wheel, n = segs.length, step = 360 / n;
    let paths = '';
    segs.forEach((s, i) => {
      const a0 = (i * step - 90) * Math.PI / 180, a1 = ((i + 1) * step - 90) * Math.PI / 180;
      const x0 = 100 + 100 * Math.cos(a0), y0 = 100 + 100 * Math.sin(a0);
      const x1 = 100 + 100 * Math.cos(a1), y1 = 100 + 100 * Math.sin(a1);
      paths += `<path d="M100,100 L${x0.toFixed(1)},${y0.toFixed(1)} A100,100 0 0,1 ${x1.toFixed(1)},${y1.toFixed(1)} Z" fill="${s.color}"/>`;
      const am = (a0 + a1) / 2, tx = 100 + 62 * Math.cos(am), ty = 100 + 62 * Math.sin(am);
      paths += `<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" transform="rotate(${(i*step+step/2).toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)})" fill="#fff" font-size="8.5" font-weight="700" text-anchor="middle" dominant-baseline="middle" font-family="Hanken Grotesk">${s.label}</text>`;
    });
    return `<svg viewBox="0 0 200 200">${paths}<circle cx="100" cy="100" r="14" fill="#fff" stroke="#271811" stroke-width="3"/></svg>`;
  }

  function doSpin() {
    const btn = screen.querySelector('#spinBtn'); const wheel = screen.querySelector('#wheel');
    btn.disabled = true; btn.textContent = 'Spinning…';
    // weighted pick (server-authoritative in prod)
    const total = CAFE.wheel.reduce((a, s) => a + s.weight, 0);
    let r = (totalSeed() % total), idx = 0;
    for (let i = 0; i < CAFE.wheel.length; i++) { if (r < CAFE.wheel[i].weight) { idx = i; break; } r -= CAFE.wheel[i].weight; }
    const n = CAFE.wheel.length, step = 360 / n;
    const target = 360 * 5 + (360 - (idx * step + step / 2));
    wheel.style.transition = 'transform 4s cubic-bezier(.17,.67,.18,1)';
    wheel.style.transform = `rotate(${target}deg)`;
    setTimeout(() => {
      const seg = CAFE.wheel[idx];
      C.spinsLeft--;
      if (seg.kind === 'coins') { CAFE.store.addCoins(seg.value); CAFE.confetti(); CAFE.toast(`You won ${seg.value} coins!`, { kind: 'coin', emoji: '🪙' }); }
      else if (seg.kind === 'coupon') { CAFE.confetti(); CAFE.toast(`Won a coupon: ${seg.value}!`, { kind: 'win', emoji: '🎟️' }); }
      else { CAFE.toast('So close! Try again next visit.', { emoji: '🙃' }); }
      renderPlay();
    }, 4100);
  }
  // deterministic-ish seed so demo varies without Math.random (blocked in workflow ctx; fine here, but keep stable)
  function totalSeed() { return Math.floor(performance.now() * 13) % 1000; }

  /* ---- REWARDS ---------------------------------------------------- */
  function renderRewards() {
    const bal = CAFE.store.balance();
    screen.innerHTML = `
      <div class="pwa-scroll">
        <header class="pwa-h"><h3>Rewards wallet</h3></header>
        <div class="wallet-hero">
          <div class="wh-bg"></div>
          <span class="wh-tier">${C.tier} member</span>
          <div class="wh-bal"><div><span class="mono">${C.points.toLocaleString('en-IN')}</span><em>points</em></div><div><span class="mono">${bal.coins}</span><em>coins</em></div></div>
          <div class="wh-prog"><i style="width:${Math.min(100,C.points/C.nextTierAt*100)}%"></i></div>
          <span class="wh-next">${C.nextTierAt - C.points} pts to Platinum</span>
        </div>
        <h4 class="rew-h">Redeem</h4>
        <div class="rew-list">
          ${CAFE.rewards.map(r => `
            <div class="rew-card">
              <span class="rew-emoji">${r.emoji}</span>
              <div class="rew-info"><b>${r.name}</b><span class="rew-type">${r.type.replace('_',' ')}</span></div>
              <button class="rew-btn ${C.points<r.cost?'lock':''}" data-rew="${r.id}">${r.cost} pts</button>
            </div>`).join('')}
        </div>
      </div>`;
    screen.querySelectorAll('[data-rew]').forEach(b => b.onclick = () => {
      const r = CAFE.rewards.find(x => x.id === b.dataset.rew);
      if (C.points < r.cost) return CAFE.toast('Not enough points yet', { emoji: '🔒' });
      C.points -= r.cost; CAFE.store.addPoints(0); CAFE.confetti();
      CAFE.toast(`Redeemed: ${r.name}`, { kind: 'win', emoji: r.emoji });
      renderRewards();
    });
  }

  /* ---- PROFILE ---------------------------------------------------- */
  function renderProfile() {
    screen.innerHTML = `
      <div class="pwa-scroll">
        <header class="pwa-h"><h3>Profile</h3></header>
        <div class="prof-card">
          <div class="prof-avatar">${C.name[0]}</div>
          <div><b>${C.name}</b><span class="mono">${C.phone}</span></div>
          <span class="pill warn" style="margin-left:auto">${C.tier}</span>
        </div>
        <div class="prof-stats">
          <div><span class="mono">${C.visits}</span><em>visits</em></div>
          <div><span class="mono">${C.streak}🔥</span><em>streak</em></div>
          <div><span class="mono">8</span><em>badges</em></div>
        </div>
        <div class="refer">
          <div class="refer-top"><span>🎁</span><div><b>Invite a friend</b><span>Both get ₹50 off the next visit</span></div></div>
          <div class="refer-code"><span class="mono">${C.referral}</span><button data-copy>Copy &amp; share</button></div>
        </div>
        <div class="badges">
          <h4>Badges</h4>
          <div class="badge-grid">
            ${[['☕','Regular','on'],['🔥','5-day streak','on'],['🎯','Sharpshooter','on'],['🌙','Night owl','on'],['👑','Big spender','off'],['🤝','Connector','off'],['🏆','Champion','off'],['🎲','Lucky','on']]
              .map(([e,n,s])=>`<div class="badge ${s}"><span>${e}</span><em>${n}</em></div>`).join('')}
          </div>
        </div>
        <div class="prof-prefs">
          <label class="pref on"><span>WhatsApp updates</span><i></i></label>
          <label class="pref on"><span>Push notifications</span><i></i></label>
          <label class="pref"><span>Reduced motion</span><i></i></label>
        </div>
      </div>`;
    screen.querySelector('[data-copy]').onclick = () => CAFE.toast('Referral link copied!', { kind: 'win', emoji: '🔗' });
    screen.querySelectorAll('.pref').forEach(p => p.onclick = () => p.classList.toggle('on'));
  }

  return { mount };
})();
