'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type BrandingProps = { appName: string; logoUrl: string; customDomain: string; poweredBy: boolean };

export function TenantSettings({
  id,
  branding,
  slots,
}: {
  id: string;
  branding: BrandingProps;
  slots: { maxBranches: string; maxStaff: string; maxCustomers: string };
}) {
  const router = useRouter();
  const [b, setB] = useState(branding);
  const [sl, setSl] = useState(slots);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const input = { background: 'var(--paper-2)', border: '1px solid var(--line)', color: 'var(--ink)' } as const;

  async function saveBranding() {
    setBusy(true);
    setMsg('');
    const res = await fetch(`/api/admin/tenants/${id}/branding`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        appName: b.appName || null,
        logoUrl: b.logoUrl || null,
        customDomain: b.customDomain || null,
        poweredBy: b.poweredBy,
      }),
    });
    setBusy(false);
    setMsg(res.ok ? 'Branding saved ✓' : 'Could not save (domain may be taken)');
    if (res.ok) router.refresh();
  }

  async function saveSlots() {
    setBusy(true);
    setMsg('');
    const overrides: Record<string, number | null> = {};
    const map = { maxBranches: sl.maxBranches, maxStaff: sl.maxStaff, maxCustomers: sl.maxCustomers };
    for (const [k, v] of Object.entries(map)) {
      const t = v.trim();
      if (t === '') continue; // unset → fall back to plan
      overrides[k] = t === 'unlimited' ? null : Number(t);
    }
    const res = await fetch(`/api/admin/tenants/${id}/slots`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slotOverrides: overrides }),
    });
    setBusy(false);
    setMsg(res.ok ? 'Slots saved ✓' : 'Could not save slots');
    if (res.ok) router.refresh();
  }

  return (
    <>
      <div className="lux-card p-5">
        <h2 className="font-display text-xl mb-3">White-label</h2>
        <div className="space-y-2">
          <input placeholder="App name (overrides ChayaOne)" value={b.appName} onChange={(e) => setB({ ...b, appName: e.target.value })} className="w-full rounded-xl px-3 py-2 text-sm outline-none" style={input} />
          <input placeholder="Logo URL" value={b.logoUrl} onChange={(e) => setB({ ...b, logoUrl: e.target.value })} className="w-full rounded-xl px-3 py-2 text-sm outline-none" style={input} />
          <input placeholder="Custom domain (brewlab.com)" value={b.customDomain} onChange={(e) => setB({ ...b, customDomain: e.target.value })} className="w-full rounded-xl px-3 py-2 text-sm outline-none" style={input} />
          <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--ink-2)' }}>
            <input type="checkbox" checked={b.poweredBy} onChange={(e) => setB({ ...b, poweredBy: e.target.checked })} />
            Show “Powered by ChayaOne”
          </label>
          <button onClick={saveBranding} disabled={busy} className="btn btn-lux w-full" style={{ padding: 10, borderRadius: 12 }}>Save branding</button>
        </div>
      </div>

      <div className="lux-card p-5">
        <h2 className="font-display text-xl mb-3">Slot overrides</h2>
        <p className="text-xs mb-2" style={{ color: 'var(--ink-3)' }}>Blank = use plan default. “unlimited” = no cap.</p>
        <div className="space-y-2">
          {(['maxBranches', 'maxStaff', 'maxCustomers'] as const).map((k) => (
            <label key={k} className="flex items-center justify-between text-sm gap-2">
              <span style={{ color: 'var(--ink-2)' }}>{k.replace('max', '')}</span>
              <input value={sl[k]} onChange={(e) => setSl({ ...sl, [k]: e.target.value })} placeholder="plan default" className="w-32 rounded-lg px-2 py-1.5 text-sm outline-none" style={input} />
            </label>
          ))}
          <button onClick={saveSlots} disabled={busy} className="btn btn-lux w-full" style={{ padding: 10, borderRadius: 12 }}>Save slots</button>
        </div>
      </div>

      {msg && <p className="text-sm font-bold" style={{ color: 'var(--ink-2)' }}>{msg}</p>}
    </>
  );
}
