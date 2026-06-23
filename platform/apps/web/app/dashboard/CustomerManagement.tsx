'use client';

import { useEffect, useState, useCallback } from 'react';
import { formatINR } from '@cafeos/core';
import type { PwaConfig } from '@/lib/pwa';

/**
 * Customer Management & Loyalty CRM — owner dashboard module.
 *
 * Self-contained client surface mounted by DashboardClient when the "Customer
 * Management" menu is active. Talks to /api/dashboard/customers (list +
 * mutations), /api/dashboard/customers/[id] (profile + timeline) and reuses
 * /api/dashboard/pwa for loyalty settings. Purely additive — no existing flow
 * is touched.
 */

type Row = {
  id: string; name: string; phone: string | null; email: string | null; gender: string | null;
  birthday: string | null; source: string; status: string; tier: string; tierName: string;
  totalOrders: number; totalSpendPaise: number; points: number; walletBalancePaise: number;
  lastVisit: string | null; createdAt: string;
};
type Analytics = {
  totalCustomers: number; newThisMonth: number; repeatCustomerRate: number; retentionRate: number;
  avgSpendPaise: number;
  topSpenders: { id: string; name: string; spendPaise: number }[];
  mostLoyal: { id: string; name: string; visits: number }[];
  highestPoints: { id: string; name: string; points: number }[];
};
type ListResp = { rows: Row[]; page: number; pageSize: number; total: number; analytics: Analytics };

type Timeline = { at: string; kind: string; label: string; meta?: Record<string, unknown> }[];
type Profile = {
  personal: { id: string; name: string; phone: string | null; email: string | null; gender: string | null; address: string | null; notes: string | null; birthday: string | null; status: string; source: string; registeredAt: string; firstVisit: string | null };
  business: { totalOrders: number; totalSpendPaise: number; avgOrderValuePaise: number; lastOrderDate: string | null; preferredItems: { name: string; qty: number }[] };
  loyalty: { points: number; walletBalancePaise: number; tier: string; tierName: string; totalPointsEarned: number; totalPointsRedeemed: number; coins: number };
  gaming: { gamesPlayed: number; gamesWon: number; rewardsEarned: number };
};

const FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'new', label: 'New' },
  { key: 'repeat', label: 'Repeat' },
  { key: 'high_value', label: 'High Value' },
  { key: 'inactive', label: 'Inactive' },
  { key: 'loyalty', label: 'Loyalty Members' },
];
const SOURCE_LABEL: Record<string, string> = { pwa: 'PWA', manual: 'Manual', import: 'Import' };
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const fmtDateTime = (s: string) => new Date(s).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function CustomerManagement({ role, flash }: { role: string; flash: (m: string) => void }) {
  const [tab, setTab] = useState<'list' | 'settings'>('list');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ search, filter, page: String(page) });
      const res = await fetch(`/api/dashboard/customers?${qs}`);
      if (res.ok) setData(await res.json());
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [search, filter, page]);

  useEffect(() => { if (tab === 'list') load(); }, [tab, load]);

  const a = data?.analytics;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="grid gap-4">
      {/* sub-tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        <TabBtn on={tab === 'list'} onClick={() => setTab('list')}>Customer Database</TabBtn>
        <TabBtn on={tab === 'settings'} onClick={() => setTab('settings')}>Loyalty Settings</TabBtn>
        {tab === 'list' && (
          <div className="ml-auto flex gap-2">
            <button className="btn" onClick={() => setShowImport(true)}>⬆ Import</button>
            <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Add Customer</button>
          </div>
        )}
      </div>

      {tab === 'list' && (
        <>
          {/* analytics widgets */}
          {a && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              <Stat label="Total Customers" value={String(a.totalCustomers)} />
              <Stat label="New This Month" value={String(a.newThisMonth)} />
              <Stat label="Repeat Rate" value={`${a.repeatCustomerRate}%`} />
              <Stat label="Retention (30d)" value={`${a.retentionRate}%`} />
              <Stat label="Avg Spend" value={formatINR(a.avgSpendPaise)} />
            </div>
          )}
          {a && (
            <div className="grid md:grid-cols-3 gap-3">
              <MiniList title="Top Spenders" rows={a.topSpenders.map((c) => ({ id: c.id, name: c.name, val: formatINR(c.spendPaise) }))} onPick={setProfileId} />
              <MiniList title="Most Loyal" rows={a.mostLoyal.map((c) => ({ id: c.id, name: c.name, val: `${c.visits} visits` }))} onPick={setProfileId} />
              <MiniList title="Highest Points" rows={a.highestPoints.map((c) => ({ id: c.id, name: c.name, val: `${c.points} pts` }))} onPick={setProfileId} />
            </div>
          )}

          {/* search + filters */}
          <div className="card p-4 grid gap-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search name, mobile or customer ID…"
                className="btn flex-1 sm:min-w-[220px]" style={{ textAlign: 'left' }}
              />
              <button className="btn sm:w-auto" onClick={() => { setPage(1); load(); }}>Search</button>
            </div>
            <div className="flex gap-2 flex-wrap">
              {FILTERS.map((f) => (
                <button key={f.key} onClick={() => { setFilter(f.key); setPage(1); }}
                  className="pill" style={filter === f.key ? { background: 'var(--turmeric)', color: '#2A1607', fontWeight: 700 } : {}}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* table */}
          <div className="card p-2 sm:p-0 overflow-auto">
            <table className="rtable w-full text-sm" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ color: 'var(--ink-3)', textAlign: 'left' }}>
                  <Th>Customer</Th><Th>Mobile</Th><Th>Source</Th><Th>Orders</Th><Th>Spend</Th>
                  <Th>Points</Th><Th>Wallet</Th><Th>Last Visit</Th><Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={9} className="p-6 text-center" style={{ color: 'var(--ink-3)' }}>Loading…</td></tr>}
                {!loading && data?.rows.length === 0 && <tr><td colSpan={9} className="p-6 text-center" style={{ color: 'var(--ink-3)' }}>No customers found.</td></tr>}
                {!loading && data?.rows.map((r) => (
                  <tr key={r.id} className="cursor-pointer hover:opacity-80" style={{ borderTop: '1px solid var(--line)' }} onClick={() => setProfileId(r.id)}>
                    <Td label="Customer">
                      <div className="font-bold">{r.name}</div>
                      <div className="text-[11px]" style={{ color: 'var(--ink-3)' }}>{r.tierName} · {r.id.slice(0, 8)}</div>
                    </Td>
                    <Td label="Mobile">{r.phone ?? '—'}</Td>
                    <Td label="Source">{SOURCE_LABEL[r.source] ?? r.source}</Td>
                    <Td label="Orders">{r.totalOrders}</Td>
                    <Td label="Spend">{formatINR(r.totalSpendPaise)}</Td>
                    <Td label="Points">{r.points}</Td>
                    <Td label="Wallet">{formatINR(r.walletBalancePaise)}</Td>
                    <Td label="Last visit">{fmtDate(r.lastVisit)}</Td>
                    <Td label="Status"><StatusBadge status={r.status} /></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* pagination */}
          {data && data.total > data.pageSize && (
            <div className="flex items-center justify-center gap-3 text-sm">
              <button className="btn" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>‹ Prev</button>
              <span style={{ color: 'var(--ink-3)' }}>Page {page} / {totalPages} · {data.total} customers</span>
              <button className="btn" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next ›</button>
            </div>
          )}
        </>
      )}

      {tab === 'settings' && <LoyaltySettings flash={flash} />}

      {showAdd && <AddCustomer onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} flash={flash} />}
      {showImport && <ImportCustomers onClose={() => setShowImport(false)} onDone={() => { setShowImport(false); load(); }} flash={flash} />}
      {profileId && <ProfileDrawer id={profileId} role={role} onClose={() => setProfileId(null)} onChanged={load} flash={flash} />}
    </div>
  );
}

/* ----------------------------- Add Customer ----------------------------- */
function AddCustomer({ onClose, onSaved, flash }: { onClose: () => void; onSaved: () => void; flash: (m: string) => void }) {
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '', birthday: '', gender: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.phone.trim()) { flash('Mobile number is required'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/dashboard/customers', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'create', ...form }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.status === 409) { flash('Customer already exists'); }
      else if (res.ok) { flash('Customer added'); onSaved(); }
      else flash(`Could not add (${(d.error ?? 'error').replace(/_/g, ' ')})`);
    } catch { flash('Network error'); } finally { setBusy(false); }
  };

  return (
    <Modal title="Add Customer" onClose={onClose}>
      <form onSubmit={submit} className="grid gap-3">
        <Field label="Name"><input className="inp" value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Mobile Number *"><input className="inp" value={form.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
        <Field label="Email"><input className="inp" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Address"><input className="inp" value={form.address} onChange={(e) => set('address', e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Birthday"><input className="inp" type="date" value={form.birthday} onChange={(e) => set('birthday', e.target.value)} /></Field>
          <Field label="Gender">
            <select className="inp" value={form.gender} onChange={(e) => set('gender', e.target.value)}>
              <option value="">—</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
            </select>
          </Field>
        </div>
        <Field label="Notes"><textarea className="inp" rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
        <div className="flex justify-end gap-2 mt-1">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save Customer'}</button>
        </div>
      </form>
    </Modal>
  );
}

/* ----------------------------- Import ----------------------------- */
function ImportCustomers({ onClose, onDone, flash }: { onClose: () => void; onDone: () => void; flash: (m: string) => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  // Parse lines: "name, phone, email" (phone required)
  const submit = async () => {
    const rows = text.split('\n').map((line) => {
      const [name, phone, email] = line.split(',').map((s) => s.trim());
      return { name, phone, email };
    }).filter((r) => r.phone);
    if (!rows.length) { flash('Add at least one row: name, mobile, email'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/dashboard/customers', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'import', rows }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) { flash(`Imported ${d.created} · skipped ${d.skipped} · invalid ${d.invalid}`); onDone(); }
      else flash('Import failed');
    } catch { flash('Network error'); } finally { setBusy(false); }
  };

  return (
    <Modal title="Import Customers" onClose={onClose}>
      <p className="text-xs mb-2" style={{ color: 'var(--ink-3)' }}>One customer per line: <b>name, mobile, email</b>. Existing mobiles are skipped.</p>
      <textarea className="inp" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Arjun, 9876543210, arjun@mail.com\nMeera, 9876500000'} />
      <div className="flex justify-end gap-2 mt-3">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? 'Importing…' : 'Import'}</button>
      </div>
    </Modal>
  );
}

/* ----------------------------- Profile drawer ----------------------------- */
function ProfileDrawer({ id, role, onClose, onChanged, flash }: { id: string; role: string; onClose: () => void; onChanged: () => void; flash: (m: string) => void }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [timeline, setTimeline] = useState<Timeline>([]);
  const [busy, setBusy] = useState(false);
  const canEdit = role === 'owner' || role === 'manager';

  const reload = useCallback(async () => {
    const res = await fetch(`/api/dashboard/customers/${id}`);
    if (res.ok) { const d = await res.json(); setProfile(d.profile); setTimeline(d.timeline ?? []); }
  }, [id]);
  useEffect(() => { reload(); }, [reload]);

  const act = async (payload: Record<string, unknown>, okMsg: string) => {
    setBusy(true);
    try {
      const res = await fetch('/api/dashboard/customers', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, ...payload }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) { flash(okMsg); await reload(); onChanged(); return true; }
      flash(`Failed (${(d.error ?? 'error').replace(/_/g, ' ')})`); return false;
    } catch { flash('Network error'); return false; } finally { setBusy(false); }
  };

  const p = profile;
  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onClose} />
      <div className="relative w-full max-w-[560px] h-full overflow-auto p-5 grid gap-4" style={{ background: 'var(--paper)', boxShadow: 'var(--sh-2)' }}>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl">{p?.personal.name ?? 'Customer'}</h2>
          <button className="btn" onClick={onClose}>✕</button>
        </div>
        {!p && <div style={{ color: 'var(--ink-3)' }}>Loading…</div>}
        {p && (
          <>
            <StatusBadge status={p.personal.status} />

            <Section title="Personal Information">
              <Info label="Mobile" value={p.personal.phone ?? '—'} />
              <Info label="Email" value={p.personal.email ?? '—'} />
              <Info label="Gender" value={p.personal.gender ?? '—'} />
              <Info label="Birthday" value={fmtDate(p.personal.birthday)} />
              <Info label="Address" value={p.personal.address ?? '—'} />
              <Info label="Registered" value={`${fmtDate(p.personal.registeredAt)} · ${SOURCE_LABEL[p.personal.source] ?? p.personal.source}`} />
              {p.personal.notes && <Info label="Notes" value={p.personal.notes} />}
            </Section>

            <Section title="Business Information">
              <Info label="Total Orders" value={String(p.business.totalOrders)} />
              <Info label="Total Spend" value={formatINR(p.business.totalSpendPaise)} />
              <Info label="Avg Order Value" value={formatINR(p.business.avgOrderValuePaise)} />
              <Info label="Last Order" value={fmtDate(p.business.lastOrderDate)} />
              <Info label="Preferred Items" value={p.business.preferredItems.map((i) => `${i.name} (${i.qty})`).join(', ') || '—'} />
            </Section>

            <Section title="Loyalty Information">
              <Info label="Current Points" value={String(p.loyalty.points)} />
              <Info label="Wallet Balance" value={formatINR(p.loyalty.walletBalancePaise)} />
              <Info label="Tier" value={p.loyalty.tierName} />
              <Info label="Total Earned" value={String(p.loyalty.totalPointsEarned)} />
              <Info label="Total Redeemed" value={String(p.loyalty.totalPointsRedeemed)} />
            </Section>

            <Section title="Gaming Information">
              <Info label="Games Played" value={String(p.gaming.gamesPlayed)} />
              <Info label="Games Won" value={String(p.gaming.gamesWon)} />
              <Info label="Rewards Earned" value={String(p.gaming.rewardsEarned)} />
            </Section>

            {canEdit && <AdminActions busy={busy} status={p.personal.status} onAct={act} />}

            <Section title="Activity Timeline">
              <div className="grid gap-2">
                {timeline.length === 0 && <span style={{ color: 'var(--ink-3)' }}>No activity yet.</span>}
                {timeline.map((t, i) => (
                  <div key={i} className="flex gap-2 items-start text-sm">
                    <span>{t.kind === 'order' ? '🧾' : t.kind === 'points' ? '⭐' : t.kind === 'game' ? '🎮' : t.kind === 'reward' ? '🎁' : '👤'}</span>
                    <div className="min-w-0">
                      <div>{t.label}</div>
                      <div className="text-[11px]" style={{ color: 'var(--ink-3)' }}>{fmtDateTime(t.at)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

/* ----------------------------- Admin actions ----------------------------- */
function AdminActions({ busy, status, onAct }: { busy: boolean; status: string; onAct: (p: Record<string, unknown>, m: string) => Promise<boolean>; }) {
  const [pts, setPts] = useState('');
  const [walletRs, setWalletRs] = useState('');
  const [reason, setReason] = useState('');
  const [nextStatus, setNextStatus] = useState(status);

  const needReason = () => { if (!reason.trim()) { return false; } return true; };
  const points = () => Math.round(Number(pts));
  const amountPaise = () => Math.round(Number(walletRs) * 100);

  return (
    <Section title="Admin Actions">
      <div className="grid gap-3 text-sm">
        <input className="inp" placeholder="Reason (required for adjustments)" value={reason} onChange={(e) => setReason(e.target.value)} />

        <div className="grid gap-2">
          <b>Loyalty Points</b>
          <div className="flex gap-2">
            <input className="inp flex-1" type="number" placeholder="Points" value={pts} onChange={(e) => setPts(e.target.value)} />
            <button className="btn" disabled={busy} onClick={async () => { if (!points() || !needReason()) return; if (await onAct({ action: 'points_add', points: points(), reason }, 'Points added')) setPts(''); }}>+ Add</button>
            <button className="btn" disabled={busy} onClick={async () => { if (!points() || !needReason()) return; if (await onAct({ action: 'points_deduct', points: points(), reason }, 'Points deducted')) setPts(''); }}>− Deduct</button>
            <button className="btn" disabled={busy} onClick={async () => { if (!points() || !needReason()) return; if (await onAct({ action: 'points_transfer', points: points(), reason }, 'Promo points added')) setPts(''); }}>↗ Promo</button>
          </div>
          <button className="btn" disabled={busy} onClick={async () => { if (!needReason()) return; if (confirm('Reset all points to 0?')) onAct({ action: 'points_reset', reason }, 'Points reset'); }}>Reset points to 0</button>
        </div>

        <div className="grid gap-2">
          <b>Wallet Credit (₹)</b>
          <div className="flex gap-2">
            <input className="inp flex-1" type="number" placeholder="₹ amount" value={walletRs} onChange={(e) => setWalletRs(e.target.value)} />
            <button className="btn" disabled={busy} onClick={async () => { if (!amountPaise() || !needReason()) return; if (await onAct({ action: 'wallet_add', amountPaise: amountPaise(), reason }, 'Wallet credit added')) setWalletRs(''); }}>+ Add</button>
            <button className="btn" disabled={busy} onClick={async () => { if (!amountPaise() || !needReason()) return; if (await onAct({ action: 'wallet_remove', amountPaise: amountPaise(), reason }, 'Wallet credit removed')) setWalletRs(''); }}>− Remove</button>
            <button className="btn" disabled={busy} onClick={async () => { if (!amountPaise() || !needReason()) return; if (await onAct({ action: 'wallet_expire', amountPaise: amountPaise(), reason }, 'Promo credit expired')) setWalletRs(''); }}>⌛ Expire</button>
          </div>
        </div>

        <div className="grid gap-2">
          <b>Status</b>
          <div className="flex gap-2">
            <select className="inp flex-1" value={nextStatus} onChange={(e) => setNextStatus(e.target.value)}>
              <option value="active">Active</option><option value="inactive">Inactive</option><option value="blocked">Blocked</option>
            </select>
            <button className="btn" disabled={busy || nextStatus === status} onClick={() => onAct({ action: 'set_status', status: nextStatus, reason }, 'Status updated')}>Apply</button>
          </div>
        </div>
      </div>
    </Section>
  );
}

/* ----------------------------- Loyalty settings ----------------------------- */
function LoyaltySettings({ flash }: { flash: (m: string) => void }) {
  const [cfg, setCfg] = useState<PwaConfig | null>(null);
  const [busy, setBusy] = useState(false);
  // local editable values (in rupees / points)
  const [perRupee, setPerRupee] = useState(''); // ₹ spent per 1 point
  const [first, setFirst] = useState('');
  const [bday, setBday] = useState('');
  const [referral, setReferral] = useState('');
  const [walletPerRupee, setWalletPerRupee] = useState('');
  const [walletEnabled, setWalletEnabled] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/dashboard/section?s=pwa');
      if (res.ok) {
        const d = await res.json();
        const c: PwaConfig = d.data?.config;
        setCfg(c);
        if (c) {
          setPerRupee(String(Math.round(c.points.earnRatePaisePerPoint / 100)));
          setFirst(String(c.loyalty.rewards.firstOrderBonus));
          setBday(String(c.loyalty.rewards.birthdayBonus));
          setReferral(String(c.loyalty.rewards.referralBonus));
          setWalletPerRupee(String(c.wallet.pointsPerRupee));
          setWalletEnabled(c.wallet.enabled);
        }
      }
    })();
  }, []);

  const save = async (payload: Record<string, unknown>, okMsg: string) => {
    setBusy(true);
    try {
      const res = await fetch('/api/dashboard/pwa', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const d = await res.json().catch(() => ({}));
      if (res.ok) { setCfg(d.config ?? null); flash(okMsg); } else flash('Could not save');
    } catch { flash('Network error'); } finally { setBusy(false); }
  };

  if (!cfg) return <div className="card p-6" style={{ color: 'var(--ink-3)' }}>Loading settings…</div>;

  return (
    <div className="grid gap-4 max-w-[640px]">
      <div className="card p-5 grid gap-3">
        <b>Earning Rate</b>
        <Field label="Rupees spent to earn 1 point (₹)">
          <input className="inp" type="number" value={perRupee} onChange={(e) => setPerRupee(e.target.value)} />
        </Field>
        <p className="text-xs" style={{ color: 'var(--ink-3)' }}>Example: ₹{perRupee || '10'} spend = 1 point.</p>
        <button className="btn btn-primary w-fit" disabled={busy}
          onClick={() => save({ action: 'points_save', earnRatePaisePerPoint: Math.max(1, Math.round(Number(perRupee || '10') * 100)) }, 'Earning rate saved')}>Save</button>
      </div>

      <div className="card p-5 grid gap-3">
        <b>Bonus Point Rules</b>
        <div className="grid grid-cols-3 gap-3">
          <Field label="First Order"><input className="inp" type="number" value={first} onChange={(e) => setFirst(e.target.value)} /></Field>
          <Field label="Birthday"><input className="inp" type="number" value={bday} onChange={(e) => setBday(e.target.value)} /></Field>
          <Field label="Referral"><input className="inp" type="number" value={referral} onChange={(e) => setReferral(e.target.value)} /></Field>
        </div>
        <button className="btn btn-primary w-fit" disabled={busy}
          onClick={() => save({ action: 'loyalty_save', rewards: { firstOrderBonus: Number(first || 0), birthdayBonus: Number(bday || 0), referralBonus: Number(referral || 0) } }, 'Bonus rules saved')}>Save</button>
      </div>

      <div className="card p-5 grid gap-3">
        <b>Wallet (points → ₹)</b>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={walletEnabled} onChange={(e) => setWalletEnabled(e.target.checked)} /> Enable wallet redemption</label>
        <Field label="Points per ₹1"><input className="inp" type="number" value={walletPerRupee} onChange={(e) => setWalletPerRupee(e.target.value)} /></Field>
        <button className="btn btn-primary w-fit" disabled={busy}
          onClick={() => save({ action: 'wallet_save', enabled: walletEnabled, pointsPerRupee: Math.max(1, Number(walletPerRupee || 10)), maxRedeemPctOfBill: cfg.wallet.maxRedeemPctOfBill, minPointsToRedeem: cfg.wallet.minPointsToRedeem }, 'Wallet settings saved')}>Save</button>
      </div>
    </div>
  );
}

/* ----------------------------- primitives ----------------------------- */
function TabBtn({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className="btn" style={on ? { background: 'var(--turmeric)', color: '#2A1607', fontWeight: 700 } : {}}>{children}</button>;
}
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--ink-3)' }}>{label}</div>
      <div className="font-display text-2xl mt-1">{value}</div>
    </div>
  );
}
function MiniList({ title, rows, onPick }: { title: string; rows: { id: string; name: string; val: string }[]; onPick: (id: string) => void }) {
  return (
    <div className="card p-4">
      <b className="text-sm">{title}</b>
      <div className="grid gap-1.5 mt-2">
        {rows.length === 0 && <span className="text-xs" style={{ color: 'var(--ink-3)' }}>—</span>}
        {rows.map((r) => (
          <button key={r.id} onClick={() => onPick(r.id)} className="flex justify-between text-sm text-left hover:opacity-70">
            <span className="truncate">{r.name}</span><b>{r.val}</b>
          </button>
        ))}
      </div>
    </div>
  );
}
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string }> = {
    active: { bg: 'color-mix(in srgb, var(--cardamom) 18%, transparent)', fg: 'var(--cardamom-d)' },
    inactive: { bg: 'var(--paper-3)', fg: 'var(--ink-3)' },
    blocked: { bg: 'color-mix(in srgb, var(--clay) 18%, transparent)', fg: 'var(--clay)' },
  };
  const s = map[status] ?? { bg: 'var(--paper-3)', fg: 'var(--ink-3)' };
  return <span className="pill w-fit" style={{ background: s.bg, color: s.fg, fontWeight: 700, textTransform: 'capitalize' }}>{status}</span>;
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-4">
      <b className="text-sm">{title}</b>
      <div className="grid gap-1.5 mt-2">{children}</div>
    </div>
  );
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span style={{ color: 'var(--ink-3)' }}>{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1 text-sm">
      <span style={{ color: 'var(--ink-3)' }}>{label}</span>
      {children}
    </label>
  );
}
function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2.5 text-[11px] uppercase tracking-wide font-bold">{children}</th>;
}
function Td({ children, label }: { children: React.ReactNode; label?: string }) {
  return <td data-label={label} className="px-3 py-2.5 align-top">{children}</td>;
}
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4">
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onClose} />
      <div className="relative w-full max-w-[460px] max-h-[90vh] overflow-auto p-5 rounded-2xl" style={{ background: 'var(--paper)', boxShadow: 'var(--sh-2)' }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-xl">{title}</h2>
          <button className="btn" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
