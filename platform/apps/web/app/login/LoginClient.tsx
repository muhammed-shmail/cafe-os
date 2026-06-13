'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'del'];

export default function LoginClient() {
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(code: string) {
    setBusy(true);
    setError(false);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pin: code }),
      });
      if (!res.ok) throw new Error();
      const { staff } = await res.json().catch(() => ({ staff: null }));
      // owners/managers go to the dashboard; cashier/kitchen/waiter to the till
      const dest = staff?.role === 'owner' || staff?.role === 'manager' ? '/dashboard' : '/pos';
      router.replace(dest);
      router.refresh();
    } catch {
      setError(true);
      setPin('');
      setBusy(false);
    }
  }

  function press(k: string) {
    if (busy) return;
    if (k === 'clear') return setPin('');
    if (k === 'del') return setPin((p) => p.slice(0, -1));
    if (pin.length >= 6) return;
    const next = pin + k;
    setPin(next);
    if (next.length === 4) submit(next); // auto-submit at 4 digits
  }

  return (
    <main className="min-h-screen grid place-items-center p-6" style={{ background: 'radial-gradient(80% 60% at 50% 0%, rgba(232,144,42,.12), transparent 60%), var(--paper)' }}>
      <div className="w-full max-w-[360px]">
        <div className="text-center mb-7">
          <div className="text-3xl mb-2" style={{ color: 'var(--turmeric-d)' }}>◐</div>
          <h1 className="font-display text-3xl">Kahwa House</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--ink-3)' }}>Enter your staff PIN to open the till</p>
        </div>

        {/* pin dots */}
        <div className={`flex justify-center gap-3 mb-6 ${error ? 'shake' : ''}`}>
          {Array.from({ length: 4 }).map((_, i) => (
            <span key={i} className="w-3.5 h-3.5 rounded-full transition"
              style={{ background: i < pin.length ? 'var(--turmeric)' : 'transparent', border: `2px solid ${i < pin.length ? 'var(--turmeric-d)' : 'var(--line-2)'}` }} />
          ))}
        </div>

        {error && <p className="text-center text-sm font-bold mb-4" style={{ color: 'var(--clay)' }}>Wrong PIN — try again</p>}

        <div className="grid grid-cols-3 gap-3">
          {KEYS.map((k) => (
            <button key={k} onClick={() => press(k)} disabled={busy}
              className="aspect-[3/2] rounded-[18px] font-display text-2xl font-bold transition active:scale-95 disabled:opacity-50"
              style={k === 'clear' || k === 'del'
                ? { background: 'transparent', color: 'var(--ink-3)', fontSize: '15px', fontFamily: 'var(--font-body)' }
                : { background: 'var(--paper-2)', border: '1px solid var(--line)', boxShadow: 'var(--sh-1)', color: 'var(--ink)' }}>
              {k === 'del' ? '⌫' : k === 'clear' ? 'Clear' : k}
            </button>
          ))}
        </div>

        <p className="text-center text-xs mt-7" style={{ color: 'var(--ink-3)' }}>
          Demo PINs · Owner <b>1111</b> · Cashier <b>2222</b> · Kitchen <b>3333</b>
        </p>
      </div>

      <style>{`@keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-8px)}40%,80%{transform:translateX(8px)}} .shake{animation:shake .4s}`}</style>
    </main>
  );
}
