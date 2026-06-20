'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const PLANS = ['starter', 'growth', 'pro', 'enterprise'] as const;

/** "New Cafe" provisioning dialog — posts to /api/admin/tenants, shows the temp owner PIN once. */
export function NewTenant() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ subdomain: string; ownerPin: string } | null>(null);
  const [f, setF] = useState({ name: '', subdomain: '', planKey: 'starter', ownerName: '', ownerPhone: '', stateCode: 'KA' });

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await fetch('/api/admin/tenants', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...f, subdomain: f.subdomain.toLowerCase() }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error === 'subdomain_taken' ? 'That subdomain is taken' : 'Could not create — check the fields');
      return;
    }
    setDone({ subdomain: f.subdomain.toLowerCase(), ownerPin: data.ownerPin });
    router.refresh();
  }

  const input = { background: 'var(--paper-2)', border: '1px solid var(--line)', color: 'var(--ink)' } as const;

  return (
    <>
      <button onClick={() => { setOpen(true); setDone(null); setError(''); }} className="btn btn-lux" style={{ padding: '10px 16px', borderRadius: 12, fontSize: 14 }}>
        + New Cafe
      </button>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center p-6" style={{ background: 'rgba(0,0,0,.45)' }} onClick={() => setOpen(false)}>
          <div className="lux-card p-6 w-full max-w-[440px]" onClick={(e) => e.stopPropagation()}>
            {done ? (
              <div className="text-center">
                <h3 className="font-display text-2xl">Cafe created 🎉</h3>
                <p className="text-sm mt-2" style={{ color: 'var(--ink-2)' }}>
                  Live at <b>{done.subdomain}.chayaone.com</b>
                </p>
                <div className="mt-4 p-4 rounded-xl" style={{ background: 'var(--paper-2)', border: '1px solid var(--line)' }}>
                  <p className="text-xs" style={{ color: 'var(--ink-3)' }}>Owner’s temporary PIN (shown once)</p>
                  <p className="font-display text-[34px] tracking-[0.3em]">{done.ownerPin}</p>
                </div>
                <button onClick={() => setOpen(false)} className="btn btn-lux w-full mt-4" style={{ padding: 12, borderRadius: 12 }}>Done</button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-3">
                <h3 className="font-display text-2xl">New Cafe</h3>
                <input required placeholder="Cafe name" value={f.name} onChange={set('name')} className="w-full rounded-xl px-3.5 py-2.5 outline-none" style={input} />
                <div className="flex gap-2 items-center">
                  <input required placeholder="subdomain" value={f.subdomain} onChange={set('subdomain')} className="flex-1 rounded-xl px-3.5 py-2.5 outline-none" style={input} />
                  <span className="text-sm" style={{ color: 'var(--ink-3)' }}>.chayaone.com</span>
                </div>
                <select value={f.planKey} onChange={set('planKey')} className="w-full rounded-xl px-3.5 py-2.5 outline-none capitalize" style={input}>
                  {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                <input required placeholder="Owner name" value={f.ownerName} onChange={set('ownerName')} className="w-full rounded-xl px-3.5 py-2.5 outline-none" style={input} />
                <div className="flex gap-2">
                  <input placeholder="Owner phone (optional)" value={f.ownerPhone} onChange={set('ownerPhone')} className="flex-1 rounded-xl px-3.5 py-2.5 outline-none" style={input} />
                  <input placeholder="State" value={f.stateCode} onChange={set('stateCode')} maxLength={2} className="w-20 rounded-xl px-3.5 py-2.5 outline-none uppercase" style={input} />
                </div>
                {error && <p className="text-sm font-bold" style={{ color: 'var(--clay)' }}>{error}</p>}
                <div className="flex gap-2 pt-1">
                  <button type="button" onClick={() => setOpen(false)} className="flex-1 rounded-xl py-2.5 text-sm font-bold" style={{ background: 'var(--paper-2)', border: '1px solid var(--line)', color: 'var(--ink-2)' }}>Cancel</button>
                  <button type="submit" disabled={busy} className="btn btn-lux flex-1" style={{ padding: '10px', borderRadius: 12 }}>{busy ? 'Creating…' : 'Create cafe'}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
