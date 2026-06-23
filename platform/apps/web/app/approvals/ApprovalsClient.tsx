'use client';

import { useEffect, useRef, useState } from 'react';
import { formatINR } from '@cafeos/core';
import { Minus, Plus, X, ArrowLeft } from '@/components/ui';

export type PendingOrder = {
  id: string;
  number: number;
  table: string;
  channel: string;
  placedAt: number;
  totalPaise: number;
  items: { id: string; name: string; qty: number; station: string | null; notes: string | null; unitPricePaise: number }[];
};

const canAct = (role: string) => ['owner', 'manager', 'cashier', 'waiter'].includes(role);

export default function ApprovalsClient({ outletName, role, initial }: { outletName: string; role: string; initial: PendingOrder[] }) {
  const [orders, setOrders] = useState<PendingOrder[]>(initial);
  // null until mounted → SSR and first client render agree (no hydration mismatch)
  const [now, setNow] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const liveRef = useRef<HTMLSpanElement>(null);
  const acts = canAct(role);

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // merge an edited order back into the list (returned by the update/delete POSTs)
  function applyOrder(po: PendingOrder) {
    setOrders((prev) => prev.map((o) => (o.id === po.id ? po : o)));
  }

  async function changeQty(orderId: string, itemId: string, qty: number) {
    if (qty < 1) return;
    try {
      const r = await fetch('/api/approvals', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'update_item', orderId, itemId, qty }) });
      if (r.ok) applyOrder((await r.json()).order);
    } catch {/* ignore */}
  }

  async function removeItem(orderId: string, itemId: string, name: string) {
    const reason = window.prompt(`Remove “${name}” from this order?\nEnter a reason (e.g. out of stock, customer changed mind):`);
    if (reason === null) return;            // cancelled
    if (!reason.trim()) { alert('A reason is required to remove an item.'); return; }
    try {
      const r = await fetch('/api/approvals', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'delete_item', orderId, itemId, reason: reason.trim() }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok) applyOrder(d.order);
      else if (d.error === 'last_item') alert(d.message);
      else alert('Could not remove the item.');
    } catch {/* ignore */}
  }

  async function refetch() {
    try {
      const r = await fetch('/api/approvals');
      if (r.ok) setOrders((await r.json()).orders ?? []);
    } catch {/* ignore */}
  }

  useEffect(() => {
    const es = new EventSource('/api/stream');
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'order.pending') {
        if (liveRef.current) { liveRef.current.style.animation = 'none'; void liveRef.current.offsetWidth; liveRef.current.style.animation = ''; }
        refetch();
      } else if (msg.type === 'order.new' || msg.type === 'order.updated') {
        // it left the pending queue (approved → kitchen, or cancelled)
        setOrders((prev) => prev.filter((o) => o.id !== msg.ticket?.id));
      }
    };
    return () => es.close();
  }, []);

  async function act(id: string, action: 'approve' | 'reject') {
    if (busy[id]) return;
    if (action === 'reject' && !confirm('Reject this order? The customer will be told it was not confirmed.')) return;
    setBusy((b) => ({ ...b, [id]: true }));
    setOrders((prev) => prev.filter((o) => o.id !== id)); // optimistic
    try {
      await fetch('/api/approvals', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ orderId: id, action }) });
    } catch {
      refetch(); // restore on failure
    } finally {
      setBusy((b) => { const n = { ...b }; delete n[id]; return n; });
    }
  }

  return (
    <div data-skin="roast" className="ap-root">
      <div className="ap-bar">
        <div className="ap-title">
          <span ref={liveRef} className="ap-live" />
          Order Approvals <em>· {outletName}</em>
        </div>
        <div className="ap-stats">
          <span className="ap-stat"><b>{orders.length}</b> waiting</span>
          <a href="/pos" className="ap-link" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><ArrowLeft size={14} aria-hidden /> Back to POS</a>
          <span className="ap-conn" style={{ color: connected ? '#56d364' : 'var(--clay)' }}>{connected ? '● live' : '○ reconnecting'}</span>
        </div>
      </div>

      {!acts && <div className="ap-hint">You can view incoming orders, but only front-of-house staff can approve them.</div>}

      {orders.length === 0 ? (
        <div className="ap-hint">
          No orders waiting. When a guest places an order from the table QR, it appears here for review
          before it’s sent to the kitchen.
        </div>
      ) : (
        <div className="ap-grid">
          {orders.map((o) => {
            const secs = now === null ? 0 : Math.floor((now - o.placedAt) / 1000);
            const late = secs > 180;
            return (
              <div key={o.id} className={`ap-card ${late ? 'late' : ''}`}>
                <div className="ap-top">
                  <span className="ap-no">#{o.number}</span>
                  <span className="ap-tbl">{o.channel === 'qr' ? '📱 ' : ''}Table {o.table}</span>
                  <span className="ap-timer">{fmt(secs)}</span>
                </div>
                <div className="ap-items">
                  {o.items.map((l) => (
                    <div key={l.id} className="ap-line">
                      <span className="ap-qty">{l.qty}×</span>
                      <span className="ap-name">{l.name}</span>
                      {acts && (
                        <span className="ap-line-edit">
                          <button title="Reduce qty" aria-label={`Reduce ${l.name}`} disabled={l.qty <= 1} onClick={() => changeQty(o.id, l.id, l.qty - 1)}><Minus size={15} aria-hidden /></button>
                          <button title="Increase qty" aria-label={`Increase ${l.name}`} onClick={() => changeQty(o.id, l.id, l.qty + 1)}><Plus size={15} aria-hidden /></button>
                          <button title="Remove item" aria-label={`Remove ${l.name}`} className="ap-line-del" onClick={() => removeItem(o.id, l.id, l.name)}><X size={15} aria-hidden /></button>
                        </span>
                      )}
                      {l.notes && <span className="ap-note">“{l.notes}”</span>}
                    </div>
                  ))}
                </div>
                <div className="ap-foot">
                  <span className="ap-total">{formatINR(o.totalPaise)}</span>
                  {acts && (
                    <div className="ap-actions">
                      <button className="ap-reject" disabled={busy[o.id]} onClick={() => act(o.id, 'reject')}>Reject</button>
                      <button className="ap-approve" disabled={busy[o.id]} onClick={() => act(o.id, 'approve')}>Approve → Kitchen</button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <style>{css}</style>
    </div>
  );
}

function fmt(secs: number) {
  const m = String(Math.floor(secs / 60)).padStart(2, '0');
  const s = String(secs % 60).padStart(2, '0');
  return `${m}:${s}`;
}

const css = `
.ap-root { min-height: 100vh; background: radial-gradient(120% 80% at 50% -10%, #20160F, transparent 60%), var(--paper); color: var(--ink); padding: calc(18px + env(safe-area-inset-top)) calc(20px + env(safe-area-inset-right)) calc(18px + env(safe-area-inset-bottom)) calc(20px + env(safe-area-inset-left)); }
.ap-bar { display: flex; align-items: center; gap: 12px 18px; margin-bottom: 18px; flex-wrap: wrap; }
.ap-title { font-family: var(--font-display); font-size: 22px; font-weight: 700; display: flex; align-items: center; gap: 12px; }
.ap-title em { font-style: normal; color: var(--ink-3); font-size: 15px; font-family: var(--font-body); font-weight: 600; }
.ap-live { width: 11px; height: 11px; border-radius: 99px; background: #3B82F6; animation: appulse 1.6s infinite; }
@keyframes appulse { 0%{box-shadow:0 0 0 0 rgba(59,130,246,.5)} 70%{box-shadow:0 0 0 10px rgba(59,130,246,0)} 100%{box-shadow:0 0 0 0 rgba(59,130,246,0)} }
.ap-stats { margin-left: auto; display: flex; gap: 16px; align-items: center; }
.ap-stat { font-size: 13px; color: var(--ink-3); font-weight: 600; }
.ap-stat b { font-family: var(--font-display); font-size: 20px; color: var(--ink); margin-right: 3px; }
.ap-link { font-size: 12.5px; font-weight: 700; color: var(--turmeric-d); text-decoration: none; }
.ap-conn { font-size: 12px; font-weight: 800; }
.ap-hint { margin: 24px auto; max-width: 520px; text-align: center; color: var(--ink-3); font-size: 14.5px; line-height: 1.6; background: var(--paper-2); border: 1px solid var(--line); border-radius: 14px; padding: 22px; }
.ap-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 220px), 1fr)); gap: 14px; align-content: start; }
.ap-card { background: var(--paper-2); border: 1px solid var(--line); border-top: 4px solid #3B82F6; border-radius: 14px; overflow: hidden; box-shadow: var(--sh-2); animation: apin .3s ease both; }
@keyframes apin { from { opacity: 0; transform: translateY(12px); } }
.ap-card.late { border-top-color: var(--clay); }
.ap-top { display: flex; align-items: center; gap: 8px; padding: 12px 14px; border-bottom: 1px dashed var(--line-2); }
.ap-no { font-family: var(--font-display); font-weight: 800; font-size: 20px; }
.ap-tbl { font-size: 12px; font-weight: 700; color: var(--ink-2); }
.ap-timer { margin-left: auto; font-size: 16px; font-weight: 700; color: var(--ink-2); font-variant-numeric: tabular-nums; }
.ap-card.late .ap-timer { color: var(--clay); }
.ap-items { padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; }
.ap-line { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.ap-qty { font-family: var(--font-display); font-weight: 800; font-size: 15px; color: var(--turmeric); }
.ap-name { font-weight: 700; font-size: 14px; }
.ap-line-edit { margin-left: auto; display: inline-flex; gap: 5px; }
.ap-line-edit button { width: 30px; height: 30px; display: grid; place-items: center; border-radius: 8px; border: 1px solid var(--line); background: var(--paper-3); color: var(--ink-2); cursor: pointer; font-family: var(--font-body); }
.ap-line-edit button:active { transform: scale(.94); }
.ap-line-edit button:disabled { opacity: .4; cursor: default; }
.ap-line-edit .ap-line-del { color: var(--clay); border-color: rgba(195,73,47,.35); }
.ap-note { width: 100%; font-size: 11.5px; color: var(--ink-3); padding-left: 22px; font-style: italic; }
.ap-foot { display: flex; align-items: center; gap: 10px; padding: 11px 14px; background: var(--paper-3); border-top: 1px solid var(--line); flex-wrap: wrap; }
.ap-total { font-family: var(--font-mono); font-weight: 800; font-size: 15px; }
.ap-actions { margin-left: auto; display: flex; gap: 8px; }
.ap-reject, .ap-approve { padding: 8px 12px; border-radius: 10px; font-weight: 800; font-size: 12.5px; border: none; cursor: pointer; font-family: var(--font-body); }
.ap-reject { background: rgba(195,73,47,.14); color: var(--clay); }
.ap-approve { background: #34C759; color: #08310f; }
.ap-reject:disabled, .ap-approve:disabled { opacity: .5; cursor: default; }
/* Touch-first on phones/tablets: the qty steppers and accept/reject controls
   meet the 44px target; desktop keeps the denser controls above. */
@media (max-width: 767px) {
  .ap-line-edit { gap: 8px; }
  .ap-line-edit button { width: 44px; height: 44px; }
  .ap-reject, .ap-approve { padding: 12px 18px; font-size: 14px; }
}
`;
