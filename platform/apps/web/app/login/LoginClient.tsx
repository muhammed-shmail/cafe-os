'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BrandMark } from '@/components/BrandMark';
import { Delete, AlphaTag } from '@/components/ui';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'del'];

type Staff = { name: string; role: string };

export default function LoginClient() {
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  // after a correct PIN we pause on an attendance-confirm step before entering
  const [staff, setStaff] = useState<Staff | null>(null);
  const [openSince, setOpenSince] = useState<string | null>(null); // existing open punch, if any

  const dest = staff?.role === 'owner' || staff?.role === 'manager' ? '/dashboard' : '/pos';

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
      const { staff: who } = await res.json().catch(() => ({ staff: null }));
      // session cookie is now set — check whether they're already clocked in today
      const att = await fetch('/api/attendance').then((r) => (r.ok ? r.json() : null)).catch(() => null);
      setOpenSince(att?.open?.clockIn ?? null);
      setStaff(who ?? { name: 'there', role: 'cashier' });
      setBusy(false);
    } catch {
      setError(true);
      setPin('');
      setBusy(false);
    }
  }

  // clock in (unless already open) then enter the app
  async function confirmAttendance(mark: boolean) {
    setBusy(true);
    try {
      if (mark && !openSince) {
        await fetch('/api/attendance', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'in' }),
        }).catch(() => {});
      }
    } finally {
      router.replace(dest);
      router.refresh();
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

  // ---- attendance confirmation step (shown after a correct PIN) ----
  if (staff) {
    const clockedTime = openSince
      ? new Date(openSince).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
      : new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    return (
      <main className="min-h-screen grid place-items-center p-6" style={{ background: 'radial-gradient(80% 60% at 50% 0%, rgba(232,144,42,.12), transparent 60%), var(--paper)' }}>
        <div className="w-full max-w-[360px] text-center">
          <div className="w-[72px] h-[72px] mx-auto mb-4 rounded-full grid place-items-center font-display text-[28px] font-bold"
            style={{ background: 'var(--gold-grad)', color: 'var(--espresso)', border: '1px solid var(--gold-d)', boxShadow: 'var(--sh-2)' }}>
            {staff.name.trim().charAt(0).toUpperCase() || '☕'}
          </div>
          <h1 className="font-display text-[32px] leading-none">Hi {staff.name} 👋</h1>
          <p className="text-sm mt-1.5 capitalize" style={{ color: 'var(--ink-3)' }}>{staff.role}</p>

          <div className="lux-card mt-6 p-5 text-left">
            {openSince ? (
              <>
                <p className="font-bold text-[15px]">✅ You're already clocked in</p>
                <p className="text-sm mt-1" style={{ color: 'var(--ink-2)' }}>Since {clockedTime} today. No need to punch again.</p>
              </>
            ) : (
              <>
                <p className="font-bold text-[15px]">🕒 Mark your attendance</p>
                <p className="text-sm mt-1" style={{ color: 'var(--ink-2)' }}>Confirm to clock in at {clockedTime} and start your shift.</p>
              </>
            )}
          </div>

          <button disabled={busy} onClick={() => confirmAttendance(true)}
            className="btn btn-lux w-full mt-5" style={{ padding: '15px', borderRadius: 16, fontSize: 16 }}>
            {busy ? 'One sec…' : openSince ? 'Continue →' : 'Confirm attendance & continue →'}
          </button>

          {!openSince && (
            <button disabled={busy} onClick={() => confirmAttendance(false)}
              className="w-full mt-3 text-sm font-bold" style={{ color: 'var(--ink-3)', background: 'none', border: 'none' }}>
              Skip for now
            </button>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen grid place-items-center p-6" style={{ background: 'radial-gradient(80% 60% at 50% 0%, rgba(232,144,42,.12), transparent 60%), var(--paper)' }}>
      <div className="w-full max-w-[360px]">
        <div className="text-center mb-7 flex flex-col items-center">
          <img src="/logo chaya one.png" alt="ChayaOne" style={{ width: 288, height: 'auto', maxWidth: '84%' }} className="mb-1.5 object-contain" />
          <AlphaTag />
          <h1 className="font-display text-[40px] leading-none mt-3.5">Kahwa House</h1>
          <p className="text-sm mt-2" style={{ color: 'var(--ink-3)' }}>Enter your staff PIN to open the till</p>
        </div>

        {/* pin dots */}
        <div className={`flex justify-center gap-3 mb-6 ${error ? 'shake' : ''}`}>
          {Array.from({ length: 4 }).map((_, i) => (
            <span key={i} className="w-3.5 h-3.5 rounded-full transition"
              style={{ background: i < pin.length ? 'var(--gold)' : 'transparent', border: `2px solid ${i < pin.length ? 'var(--gold-d)' : 'var(--line-2)'}`, boxShadow: i < pin.length ? '0 0 0 3px color-mix(in srgb, var(--gold) 20%, transparent)' : 'none' }} />
          ))}
        </div>

        {error && <p role="alert" className="text-center text-sm font-bold mb-4" style={{ color: 'var(--clay)' }}>Wrong PIN — try again</p>}

        <div className="grid grid-cols-3 gap-3">
          {KEYS.map((k) => (
            <button key={k} onClick={() => press(k)} disabled={busy}
              aria-label={k === 'del' ? 'Delete' : k === 'clear' ? 'Clear' : `Digit ${k}`}
              className="aspect-[3/2] grid place-items-center rounded-[18px] font-display text-2xl font-bold transition active:scale-95 disabled:opacity-50"
              style={k === 'clear' || k === 'del'
                ? { background: 'transparent', color: 'var(--ink-3)', fontSize: '15px', fontFamily: 'var(--font-body)' }
                : { background: 'var(--paper-2)', border: '1px solid var(--line)', boxShadow: 'var(--sh-1)', color: 'var(--ink)' }}>
              {k === 'del' ? <Delete size={22} aria-hidden /> : k === 'clear' ? 'Clear' : k}
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
