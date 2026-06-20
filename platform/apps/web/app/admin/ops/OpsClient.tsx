'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Announcement = { id: string; title: string; audience: string; published: boolean; createdAt: string };
type Ticket = { id: string; subject: string; status: string; priority: string; tenant: string; createdAt: string };

const TICKET_STATES = ['open', 'in_progress', 'waiting', 'resolved', 'closed'] as const;

export function OpsClient({ announcements, tickets }: { announcements: Announcement[]; tickets: Ticket[] }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState('all');
  const [busy, setBusy] = useState(false);

  async function publish(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await fetch('/api/admin/announcements', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title, body, audience, publish: true }),
    }).catch(() => {});
    setBusy(false);
    setTitle('');
    setBody('');
    router.refresh();
  }

  async function setStatus(id: string, status: string) {
    await fetch('/api/admin/tickets', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, status }),
    }).catch(() => {});
    router.refresh();
  }

  const input = { background: 'var(--paper-2)', border: '1px solid var(--line)', color: 'var(--ink)' } as const;

  return (
    <div className="space-y-6">
      <div className="lux-card p-5">
        <h2 className="font-display text-xl mb-3">Announcements</h2>
        <form onSubmit={publish} className="space-y-2 mb-4">
          <input required placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-xl px-3 py-2 text-sm outline-none" style={input} />
          <textarea required placeholder="Message to cafes…" value={body} onChange={(e) => setBody(e.target.value)} rows={2} className="w-full rounded-xl px-3 py-2 text-sm outline-none" style={input} />
          <div className="flex gap-2">
            <input value={audience} onChange={(e) => setAudience(e.target.value)} className="flex-1 rounded-xl px-3 py-2 text-sm outline-none" style={input} placeholder="all | plan:pro | tenant:<id>" />
            <button type="submit" disabled={busy} className="btn btn-lux" style={{ padding: '8px 14px', borderRadius: 12, fontSize: 14 }}>{busy ? '…' : 'Publish'}</button>
          </div>
        </form>
        <div className="space-y-2 max-h-[200px] overflow-auto">
          {announcements.map((a) => (
            <div key={a.id} className="text-sm flex justify-between border-b pb-1.5" style={{ borderColor: 'var(--line)' }}>
              <span className="font-bold">{a.title} <span className="font-normal" style={{ color: 'var(--ink-3)' }}>· {a.audience}</span></span>
              <span className="text-xs" style={{ color: a.published ? 'var(--ok-ink)' : 'var(--ink-3)' }}>{a.published ? 'live' : 'draft'}</span>
            </div>
          ))}
          {announcements.length === 0 && <p className="text-sm" style={{ color: 'var(--ink-3)' }}>No announcements.</p>}
        </div>
      </div>

      <div className="lux-card p-5">
        <h2 className="font-display text-xl mb-3">Support tickets</h2>
        <div className="space-y-2 max-h-[320px] overflow-auto">
          {tickets.map((t) => (
            <div key={t.id} className="border-b pb-2" style={{ borderColor: 'var(--line)' }}>
              <div className="flex justify-between items-start gap-2">
                <div>
                  <p className="text-sm font-bold">{t.subject}</p>
                  <p className="text-xs" style={{ color: 'var(--ink-3)' }}>{t.tenant} · {t.priority} · {t.createdAt}</p>
                </div>
                <select value={t.status} onChange={(e) => setStatus(t.id, e.target.value)} className="text-xs rounded-lg px-2 py-1 outline-none" style={input}>
                  {TICKET_STATES.map((st) => <option key={st} value={st}>{st}</option>)}
                </select>
              </div>
            </div>
          ))}
          {tickets.length === 0 && <p className="text-sm" style={{ color: 'var(--ink-3)' }}>No tickets.</p>}
        </div>
      </div>
    </div>
  );
}
