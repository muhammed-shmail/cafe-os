/* =========================================================================
   Cafe OS — Shell: surface router, skin manager, toast system.
   ========================================================================= */
(function () {
  const stage = document.getElementById('stage');
  const switcher = document.getElementById('switcher');
  const html = document.documentElement;

  const SURFACES = {
    home:      { skin: 'paper', mount: mountHome },
    pos:       { skin: 'paper', mount: () => CAFE.POS.mount(stage) },
    kds:       { skin: 'roast', mount: () => CAFE.KDS.mount(stage) },
    pwa:       { skin: 'paper', mount: () => CAFE.PWA.mount(stage) },
    dashboard: { skin: 'paper', mount: () => CAFE.DASH.mount(stage) },
  };

  function mountHome() {
    const t = document.getElementById('tpl-home').content.cloneNode(true);
    stage.appendChild(t);
  }

  function go(name) {
    if (!SURFACES[name]) name = 'home';
    const s = SURFACES[name];
    html.setAttribute('data-surface', name);
    html.setAttribute('data-skin', s.skin);
    stage.innerHTML = '';
    s.mount();
    // active nav state
    switcher.querySelectorAll('.sw').forEach(b => b.classList.toggle('on', b.dataset.go === name));
    window.scrollTo(0, 0);
    location.hash = name;
  }
  CAFE.go = go;

  // delegated navigation for any [data-go]
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-go]');
    if (el) { e.preventDefault(); go(el.dataset.go); }
  });

  /* ---- toast / celebration ---------------------------------------- */
  let toastWrap;
  CAFE.toast = function (msg, opts = {}) {
    if (!toastWrap) {
      toastWrap = document.createElement('div');
      toastWrap.className = 'toast-wrap';
      document.body.appendChild(toastWrap);
    }
    const t = document.createElement('div');
    t.className = 'toast' + (opts.kind ? ' ' + opts.kind : '');
    t.innerHTML = (opts.emoji ? `<span class="t-emoji">${opts.emoji}</span>` : '') + `<span>${msg}</span>`;
    toastWrap.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 350); }, opts.ms || 2600);
  };

  /* ---- confetti (canvas-free, lightweight) ------------------------ */
  CAFE.confetti = function (origin) {
    const wrap = document.createElement('div');
    wrap.className = 'confetti';
    const colors = ['#E8902A', '#4E7A4A', '#C3492F', '#8E3B6B', '#D9A93A'];
    for (let i = 0; i < 46; i++) {
      const p = document.createElement('i');
      const a = Math.random() * Math.PI - Math.PI / 2;
      p.style.setProperty('--x', (Math.cos(a) * (60 + Math.random() * 220)).toFixed(0) + 'px');
      p.style.setProperty('--y', (-120 - Math.random() * 220).toFixed(0) + 'px');
      p.style.setProperty('--r', (Math.random() * 720 - 360).toFixed(0) + 'deg');
      p.style.setProperty('--d', (0.7 + Math.random() * 0.7).toFixed(2) + 's');
      p.style.background = colors[i % colors.length];
      if (i % 3 === 0) p.style.borderRadius = '50%';
      wrap.appendChild(p);
    }
    (origin || document.body).appendChild(wrap);
    setTimeout(() => wrap.remove(), 1800);
  };

  // boot
  const initial = (location.hash || '#home').slice(1);
  go(SURFACES[initial] ? initial : 'home');
  window.addEventListener('hashchange', () => {
    const n = (location.hash || '#home').slice(1);
    if (html.getAttribute('data-surface') !== n) go(n);
  });
})();
