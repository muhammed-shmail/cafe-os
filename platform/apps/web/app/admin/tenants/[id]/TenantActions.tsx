'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/** Lifecycle buttons for a tenant: suspend / activate / delete (audited server-side). */
export function TenantActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function act(path: string, method = 'POST') {
    setBusy(true);
    await fetch(`/api/admin/tenants/${id}${path}`, { method }).catch(() => {});
    setBusy(false);
    router.refresh();
  }

  async function remove() {
    if (!confirm('Delete this cafe and ALL its data permanently? This cannot be undone.')) return;
    setBusy(true);
    const res = await fetch(`/api/admin/tenants/${id}`, { method: 'DELETE' }).catch(() => null);
    setBusy(false);
    if (res?.ok) router.replace('/admin/tenants');
  }

  return (
    <div className="flex items-center gap-2">
      {status === 'suspended' ? (
        <button disabled={busy} onClick={() => act('/activate')} className="text-sm font-bold rounded-lg px-3 py-2"
          style={{ background: 'var(--ok-bg)', color: 'var(--ok-ink)', border: '1px solid var(--ok)' }}>
          Activate
        </button>
      ) : (
        <button disabled={busy} onClick={() => act('/suspend')} className="text-sm font-bold rounded-lg px-3 py-2"
          style={{ background: 'var(--warn-bg)', color: 'var(--warn-ink)', border: '1px solid var(--warn)' }}>
          Suspend
        </button>
      )}
      <button disabled={busy} onClick={remove} className="text-sm font-bold rounded-lg px-3 py-2"
        style={{ background: 'var(--danger-bg)', color: 'var(--danger-ink)', border: '1px solid var(--danger)' }}>
        Delete
      </button>
    </div>
  );
}
