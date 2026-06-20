'use client';

import { useEffect, useState } from 'react';
import { BrandMark } from '@/components/BrandMark';

type Bip = { prompt: () => void; userChoice: Promise<{ outcome: string }> };

const BENEFITS = [
  ['🎁', 'Earn & redeem points', 'Every order earns loyalty points you can spend on free items.'],
  ['📡', 'Live order tracking', 'Watch your order go from kitchen to table in real time.'],
  ['📶', 'Works offline', 'Browse the menu even with patchy cafe wifi.'],
  ['⚡', 'Faster reorder', 'Your table and favourites are one tap away next time.'],
  ['🎮', 'Play & win', 'Beat the wait with quick games and win rewards.'],
];

export default function DownloadPage() {
  const [deferred, setDeferred] = useState<Bip | null>(null);
  const [platform, setPlatform] = useState<'ios' | 'android' | 'desktop'>('desktop');
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onBip = (e: Event) => { e.preventDefault(); setDeferred(e as unknown as Bip); };
    window.addEventListener('beforeinstallprompt', onBip);
    const ua = navigator.userAgent || '';
    if (/iphone|ipad|ipod/i.test(ua)) setPlatform('ios');
    else if (/android/i.test(ua)) setPlatform('android');
    const standalone = (navigator as unknown as { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches;
    setInstalled(standalone);
    return () => window.removeEventListener('beforeinstallprompt', onBip);
  }, []);

  async function install() {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice.catch(() => {});
    setDeferred(null);
  }

  return (
    <main className="dl">
      <section className="dl-hero">
        <img src="/logo chaya one.png" alt="ChayaOne" style={{ width: 132, height: 132, objectFit: 'contain' }} />
        <h1 className="dl-title">Install ChayaOne</h1>
        <p className="dl-sub">Your cafe, in your pocket — order, earn points, and track your table.</p>

        {installed ? (
          <div className="dl-installed">✓ You’re already running the installed app.</div>
        ) : deferred ? (
          <button className="dl-cta" onClick={install}>⬇ Install ChayaOne App</button>
        ) : platform === 'ios' ? (
          <div className="dl-steps">
            <b>Install on iPhone / iPad</b>
            <ol>
              <li>Tap the <b>Share</b> button <span className="dl-ic">⬆</span> in Safari.</li>
              <li>Scroll and tap <b>Add to Home Screen</b>.</li>
              <li>Tap <b>Add</b> — ChayaOne appears on your home screen.</li>
            </ol>
          </div>
        ) : platform === 'android' ? (
          <div className="dl-steps">
            <b>Install on Android</b>
            <ol>
              <li>Open this page in <b>Chrome</b>.</li>
              <li>Tap the <b>⋮</b> menu (top-right).</li>
              <li>Tap <b>Install app</b> / <b>Add to Home screen</b>.</li>
            </ol>
          </div>
        ) : (
          <div className="dl-steps">
            <b>Install on your phone</b>
            <p>Open <b>app.chayaone.com/download</b> on your phone’s browser, then use “Add to Home Screen”.</p>
          </div>
        )}
      </section>

      <section className="dl-benefits">
        <h2>Why install?</h2>
        {BENEFITS.map(([icon, title, desc]) => (
          <div className="dl-benefit" key={title}>
            <span className="dl-emoji" aria-hidden>{icon}</span>
            <div><b>{title}</b><span>{desc}</span></div>
          </div>
        ))}
      </section>

      <a className="dl-open" href="/app">Open ChayaOne in browser →</a>

      <style>{css}</style>
    </main>
  );
}

const css = `
.dl { min-height: 100svh; max-width: 480px; margin: 0 auto; display: flex; flex-direction: column; gap: 20px; padding: calc(36px + env(safe-area-inset-top)) 22px calc(28px + env(safe-area-inset-bottom)); background: radial-gradient(85% 42% at 50% 0%, color-mix(in srgb, var(--turmeric) 16%, transparent), transparent 70%), var(--paper); color: var(--ink); }
.dl-hero { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 10px; }
.dl-title { font-family: var(--font-display); font-size: 34px; font-weight: 600; line-height: 1.05; margin-top: 4px; }
.dl-sub { font-size: 14px; color: var(--ink-2); max-width: 320px; line-height: 1.45; }
.dl-cta { margin-top: 8px; width: 100%; min-height: 54px; padding: 16px; border-radius: 18px; background: var(--gold); color: var(--espresso); border: 1px solid var(--gold-d); font-family: var(--font-body); font-weight: 800; font-size: 16px; cursor: pointer; box-shadow: var(--sh-2); transition: transform .15s ease; }
.dl-cta:active { transform: scale(0.98); }
.dl-installed { margin-top: 6px; padding: 12px 16px; border-radius: 14px; background: var(--ok-bg); color: var(--ok-ink); border: 1px solid var(--ok); font-weight: 700; font-size: 14px; }
.dl-steps { width: 100%; text-align: left; background: var(--paper-2); border: 1px solid var(--line); border-radius: 18px; padding: 16px; margin-top: 6px; }
.dl-steps b { font-size: 14.5px; }
.dl-steps ol { margin: 10px 0 0; padding-left: 20px; display: flex; flex-direction: column; gap: 8px; font-size: 13.5px; color: var(--ink-2); }
.dl-steps p { margin-top: 8px; font-size: 13.5px; color: var(--ink-2); }
.dl-ic { display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 6px; background: var(--paper-3); border: 1px solid var(--line); }
.dl-benefits { display: flex; flex-direction: column; gap: 12px; }
.dl-benefits h2 { font-family: var(--font-display); font-size: 20px; font-weight: 600; }
.dl-benefit { display: flex; gap: 13px; align-items: flex-start; background: var(--paper-2); border: 1px solid color-mix(in srgb, var(--line) 60%, transparent); border-radius: 16px; padding: 14px; }
.dl-emoji { font-size: 24px; line-height: 1; }
.dl-benefit div { display: flex; flex-direction: column; gap: 2px; }
.dl-benefit b { font-size: 14.5px; }
.dl-benefit span { font-size: 12.5px; color: var(--ink-3); line-height: 1.4; }
.dl-open { text-align: center; font-size: 14px; font-weight: 700; color: var(--gold-d); text-decoration: none; padding: 10px; }
`;
