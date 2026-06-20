'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/** Top-bar actions for the control plane: 2FA enrolment prompt + logout. */
export function AdminBar({ name, totpEnabled }: { name: string; totpEnabled: boolean }) {
  const router = useRouter();
  const [enrolling, setEnrolling] = useState(false);
  const [secret, setSecret] = useState('');
  const [url, setUrl] = useState('');
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function startEnrol() {
    setBusy(true);
    const r = await fetch('/api/admin/auth/totp').then((x) => x.json()).catch(() => null);
    if (r?.secret) {
      setSecret(r.secret);
      setUrl(r.otpauthUrl);
      setEnrolling(true);
    }
    setBusy(false);
  }

  async function confirmEnrol() {
    setBusy(true);
    setMsg('');
    const r = await fetch('/api/admin/auth/totp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: code }),
    });
    if (r.ok) {
      setMsg('2FA enabled ✓');
      setEnrolling(false);
      router.refresh();
    } else {
      setMsg('Invalid code — try again');
    }
    setBusy(false);
  }

  async function logout() {
    await fetch('/api/admin/auth/logout', { method: 'POST' }).catch(() => {});
    router.replace('/admin/login');
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3">
      {!totpEnabled && !enrolling && (
        <button onClick={startEnrol} disabled={busy} className="text-xs font-bold rounded-lg px-3 py-2"
          style={{ background: 'var(--warn-bg)', color: 'var(--warn-ink)', border: '1px solid var(--warn)' }}>
          ⚠ Enable 2FA
        </button>
      )}
      <span className="text-sm" style={{ color: 'var(--ink-2)' }}>{name}</span>
      <button onClick={logout} className="text-xs font-bold rounded-lg px-3 py-2"
        style={{ background: 'var(--paper-2)', border: '1px solid var(--line)', color: 'var(--ink-2)' }}>
        Sign out
      </button>

      {enrolling && (
        <div className="fixed inset-0 z-50 grid place-items-center p-6" style={{ background: 'rgba(0,0,0,.45)' }} onClick={() => setEnrolling(false)}>
          <div className="lux-card p-6 w-full max-w-[420px]" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-2xl">Enable two-factor</h3>
            <p className="text-sm mt-1" style={{ color: 'var(--ink-2)' }}>
              Add this key to your authenticator app (Google Authenticator, 1Password, etc.), then enter the 6-digit code.
            </p>
            <div className="mt-3 p-3 rounded-xl text-center font-mono text-sm break-all" style={{ background: 'var(--paper-2)', border: '1px solid var(--line)' }}>
              {secret}
            </div>
            <p className="text-[11px] mt-1 break-all" style={{ color: 'var(--ink-3)' }}>{url}</p>
            <input inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456" className="w-full mt-3 rounded-xl px-3.5 py-3 text-center tracking-[0.4em] outline-none"
              style={{ background: 'var(--paper-2)', border: '1px solid var(--line)', color: 'var(--ink)' }} />
            {msg && <p className="text-sm font-bold mt-2 text-center" style={{ color: 'var(--clay)' }}>{msg}</p>}
            <button onClick={confirmEnrol} disabled={busy || code.length !== 6} className="btn btn-lux w-full mt-3" style={{ padding: 12, borderRadius: 12 }}>
              {busy ? 'Verifying…' : 'Verify & enable'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
