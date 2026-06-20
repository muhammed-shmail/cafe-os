'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/** Nuro7 control-plane login — email + password + (once enrolled) TOTP 2FA. */
export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [needTotp, setNeedTotp] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password, token: token || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.error === 'totp_required') {
          setNeedTotp(true);
          setError(token ? 'Invalid 2FA code — try again' : '');
        } else {
          setError('Invalid email or password');
        }
        setBusy(false);
        return;
      }
      const next = new URLSearchParams(window.location.search).get('next') || '/admin';
      router.replace(next);
      router.refresh();
    } catch {
      setError('Something went wrong — try again');
      setBusy(false);
    }
  }

  const inputStyle = {
    background: 'var(--paper-2)',
    border: '1px solid var(--line)',
    boxShadow: 'var(--sh-1)',
    color: 'var(--ink)',
  } as const;

  return (
    <main
      className="min-h-screen grid place-items-center p-6"
      style={{ background: 'radial-gradient(80% 60% at 50% 0%, rgba(232,144,42,.12), transparent 60%), var(--paper)' }}
    >
      <form onSubmit={submit} className="w-full max-w-[380px]">
        <div className="text-center mb-7">
          <p className="font-display text-[13px] tracking-[0.3em] uppercase" style={{ color: 'var(--gold-d)' }}>
            Nuro7
          </p>
          <h1 className="font-display text-[38px] leading-none mt-1.5">Control Plane</h1>
          <p className="text-sm mt-2" style={{ color: 'var(--ink-3)' }}>
            Platform administration · sign in to continue
          </p>
        </div>

        <div className="lux-card p-5 space-y-3">
          <label className="block">
            <span className="text-xs font-bold" style={{ color: 'var(--ink-3)' }}>Email</span>
            <input
              type="email" required autoComplete="username" value={email}
              onChange={(e) => setEmail(e.target.value)} disabled={busy}
              className="w-full mt-1 rounded-xl px-3.5 py-3 text-[15px] outline-none" style={inputStyle}
              placeholder="you@nuro7.com"
            />
          </label>

          <label className="block">
            <span className="text-xs font-bold" style={{ color: 'var(--ink-3)' }}>Password</span>
            <input
              type="password" required autoComplete="current-password" value={password}
              onChange={(e) => setPassword(e.target.value)} disabled={busy}
              className="w-full mt-1 rounded-xl px-3.5 py-3 text-[15px] outline-none" style={inputStyle}
              placeholder="••••••••"
            />
          </label>

          {needTotp && (
            <label className="block">
              <span className="text-xs font-bold" style={{ color: 'var(--ink-3)' }}>Authenticator code</span>
              <input
                inputMode="numeric" autoComplete="one-time-code" value={token}
                onChange={(e) => setToken(e.target.value.replace(/\D/g, '').slice(0, 6))} disabled={busy}
                className="w-full mt-1 rounded-xl px-3.5 py-3 text-[15px] tracking-[0.4em] text-center outline-none" style={inputStyle}
                placeholder="123456"
              />
            </label>
          )}

          {error && (
            <p role="alert" className="text-sm font-bold text-center" style={{ color: 'var(--clay)' }}>{error}</p>
          )}

          <button type="submit" disabled={busy} className="btn btn-lux w-full" style={{ padding: '14px', borderRadius: 14, fontSize: 15 }}>
            {busy ? 'Signing in…' : 'Sign in →'}
          </button>
        </div>

        <p className="text-center text-xs mt-6" style={{ color: 'var(--ink-3)' }}>
          Nuro7 staff only. Tenant owners sign in at their cafe’s address.
        </p>
      </form>
    </main>
  );
}
