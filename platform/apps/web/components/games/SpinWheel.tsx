'use client';

import { useRef, useState } from 'react';
import { WHEEL } from '@/lib/wheel';

/**
 * Spin the Wheel — ported out of PwaClient so the Play tab can host a games hub.
 * Behaviour is unchanged: the SERVER decides the prize, the client only animates
 * to the returned index (the anti-cheat guarantee).
 */
export function SpinWheel({ qs, spinsLeft: initialSpins, coins, points, onResult, reload, onExit }: {
  qs: string;
  spinsLeft: number;
  coins: number;
  points: number;
  onResult: (m: string, e: string) => void;
  reload: () => void;
  onExit: () => void;
}) {
  const [spinsLeft, setSpinsLeft] = useState(initialSpins);
  const [spinning, setSpinning] = useState(false);
  const [rot, setRot] = useState(0);
  const wheelRef = useRef<SVGSVGElement>(null);

  async function spin() {
    if (spinning || spinsLeft <= 0) return;
    setSpinning(true);
    const fp = `${navigator.userAgent.slice(0, 40)}|${screen.width}x${screen.height}`;
    const r = await fetch('/api/customer/spin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ t: qs.replace('?t=', '') || undefined, fingerprint: fp }) });
    if (!r.ok) { setSpinning(false); onResult('No spins left this visit', '🙃'); return; }
    const data = await r.json();
    const n = WHEEL.length, step = 360 / n;
    const target = 360 * 5 + (360 - (data.index * step + step / 2));
    setRot(target);
    setTimeout(() => {
      const seg = data.segment;
      if (seg.kind === 'coins') onResult(`You won ${seg.value} coins!`, '🪙');
      else if (seg.kind === 'coupon') onResult(`Won a coupon: ${seg.value}!`, '🎟️');
      else onResult('So close! Try again next visit.', '🙃');
      setSpinsLeft(0); setSpinning(false); reload();
    }, 4100);
  }

  return (
    <>
      <div className="g-bar"><button className="g-back" onClick={onExit}>←</button><h3>Spin the Wheel</h3></div>
      <header className="pwa-h" style={{ textAlign: 'center' }}><span>{spinsLeft > 0 ? `${spinsLeft} spin left this visit` : 'Come back next visit'}</span></header>
      <div className="wheel-wrap">
        <div className="wheel-pointer">▼</div>
        <svg ref={wheelRef} className="wheel" viewBox="0 0 200 200" style={{ transform: `rotate(${rot}deg)`, transition: rot ? 'transform 4s cubic-bezier(.17,.67,.18,1)' : 'none' }}>
          {WHEEL.map((s, i) => {
            const step = 360 / WHEEL.length;
            const a0 = ((i * step - 90) * Math.PI) / 180, a1 = (((i + 1) * step - 90) * Math.PI) / 180;
            const x0 = 100 + 100 * Math.cos(a0), y0 = 100 + 100 * Math.sin(a0);
            const x1 = 100 + 100 * Math.cos(a1), y1 = 100 + 100 * Math.sin(a1);
            const am = (a0 + a1) / 2, tx = 100 + 62 * Math.cos(am), ty = 100 + 62 * Math.sin(am);
            return (
              <g key={i}>
                <path d={`M100,100 L${x0.toFixed(1)},${y0.toFixed(1)} A100,100 0 0,1 ${x1.toFixed(1)},${y1.toFixed(1)} Z`} fill={s.color} />
                <text x={tx.toFixed(1)} y={ty.toFixed(1)} transform={`rotate(${(i * step + step / 2).toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)})`} fill="#fff" fontSize="8.5" fontWeight="700" textAnchor="middle" dominantBaseline="middle">{s.label}</text>
              </g>
            );
          })}
          <circle cx="100" cy="100" r="14" fill="#fff" stroke="#271811" strokeWidth="3" />
        </svg>
        <button className="spin-btn" onClick={spin} disabled={spinning || spinsLeft <= 0}>{spinning ? 'Spinning…' : spinsLeft > 0 ? 'SPIN' : 'No spins left'}</button>
      </div>
      <div className="play-bal"><span>🪙 {coins} coins</span><span>★ {points.toLocaleString('en-IN')} pts</span></div>
      <p className="anti-cheat">🔒 Server-authoritative &amp; rate-limited · 1 spin per visit, device-bound.</p>
    </>
  );
}
