'use client';

import { useEffect, useState } from 'react';
import { formatINR } from '@cafeos/core';
import type {
  SalesData,
  InventoryData,
  StaffData,
  LoyaltyData,
  MarketingData,
  MenuData,
  SettingsData,
  SectionData,
} from '@/lib/sections';
import type { StaffRole } from '@cafeos/db';
import { ROLE_LABELS, ALL_ROLES } from '@/lib/rbac';

/* maps a sidebar label → API section key (only those with a deep view) */
export const SECTION_KEY: Record<string, SectionData['section'] | undefined> = {
  'Sales & Analytics': 'sales',
  Inventory: 'inventory',
  Staff: 'staff',
  'Loyalty & Games': 'loyalty',
  Marketing: 'marketing',
  Menu: 'menu',
  Settings: 'settings',
};

/* --------------------------- loader shell --------------------------- */
export function SectionView({ section, title }: { section: SectionData['section']; title?: string }) {
  const [state, setState] = useState<{ loading: boolean; error: string | null; payload: SectionData | null }>({
    loading: true,
    error: null,
    payload: null,
  });

  const load = () => {
    fetch(`/api/dashboard/section?s=${section}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((payload: SectionData) => setState({ loading: false, error: null, payload }))
      .catch((e) => setState({ loading: false, error: String(e.message ?? e), payload: null }));
  };

  useEffect(() => {
    let alive = true;
    setState({ loading: true, error: null, payload: null });
    fetch(`/api/dashboard/section?s=${section}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((payload: SectionData) => alive && setState({ loading: false, error: null, payload }))
      .catch((e) => alive && setState({ loading: false, error: String(e.message ?? e), payload: null }));
    return () => {
      alive = false;
    };
  }, [section]);

  return (
    <div className="grid gap-4">
      {title && <SectionHeader title={title} />}
      {state.loading && <Loading />}
      {state.error && <Card><Empty>Couldn’t load this section — {state.error}. Try Refresh.</Empty></Card>}
      {state.payload && <SectionBody payload={state.payload} refresh={load} />}
    </div>
  );
}

function SectionBody({ payload, refresh }: { payload: SectionData; refresh: () => void }) {
  switch (payload.section) {
    case 'sales':
      return <Sales d={payload.data} />;
    case 'inventory':
      return <Inventory d={payload.data} />;
    case 'staff':
      return <Staff d={payload.data} refresh={refresh} />;
    case 'loyalty':
      return <Loyalty d={payload.data} />;
    case 'marketing':
      return <Marketing d={payload.data} />;
    case 'menu':
      return <Menu d={payload.data} />;
    case 'settings':
      return <Settings d={payload.data} />;
  }
}

/* =============================== Sales =============================== */
function Sales({ d }: { d: SalesData }) {
  const maxGross = Math.max(...d.daily.map((x) => x.grossPaise), 1);
  const payTotal = d.payMix.reduce((s, p) => s + p.amountPaise, 0);
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Kpi label="Revenue · 30d" value={formatINR(d.totals.grossPaise)} />
      <Kpi label="Orders · 30d" value={String(d.totals.orders)} />
      <Kpi label="Avg order value" value={formatINR(d.totals.aovPaise)} />
      <Kpi label="Tax collected" value={formatINR(d.totals.taxPaise)} />

      <Card className="col-span-2 lg:col-span-4 p-5">
        <CardHead title="Revenue · last 14 days" hint={`discounts ${formatINR(d.totals.discountPaise)}`} />
        {d.totals.orders === 0 ? (
          <Empty>No settled orders in this window yet.</Empty>
        ) : (
          <div className="flex items-end justify-between gap-1.5 h-44">
            {d.daily.map((t, i) => (
              <div key={i} className="flex-1 flex flex-col items-center justify-end h-full gap-1.5">
                <div
                  className="w-full max-w-[26px] rounded-t-md transition-all"
                  style={{
                    height: `${(t.grossPaise / maxGross) * 100}%`,
                    minHeight: t.grossPaise > 0 ? 4 : 2,
                    background: i === d.daily.length - 1 ? 'var(--turmeric)' : 'var(--turmeric-l)',
                  }}
                  title={`${t.date} · ${formatINR(t.grossPaise)} · ${t.orders} orders`}
                />
                <em className="text-[10px] not-italic" style={{ color: 'var(--ink-3)' }}>{t.label}</em>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="col-span-2 p-5">
        <CardHead title="Payment mix" hint="successful · 30d" />
        {d.payMix.length === 0 ? (
          <Empty>No captured payments yet.</Empty>
        ) : (
          <div className="grid gap-2.5">
            {d.payMix.map((p) => (
              <div key={p.method}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <b className="capitalize">{p.method}</b>
                  <span className="tnum" style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-2)' }}>
                    {formatINR(p.amountPaise)} · {p.count}
                  </span>
                </div>
                <Bar pct={payTotal > 0 ? (p.amountPaise / payTotal) * 100 : 0} />
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="col-span-2 p-5">
        <CardHead title="Order types" hint="30d" />
        {d.typeMix.length === 0 ? (
          <Empty>No orders yet.</Empty>
        ) : (
          <div className="grid gap-2.5">
            {d.typeMix.map((p) => (
              <div key={p.type} className="flex items-center justify-between py-1.5 px-2 rounded-lg" style={{ background: 'var(--paper-3)' }}>
                <b className="text-sm capitalize">{p.type.replace('_', '-')}</b>
                <span className="text-sm tnum" style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-2)' }}>
                  {p.orders} · {formatINR(p.grossPaise)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="col-span-2 lg:col-span-4 p-5">
        <CardHead title="Top items by revenue" hint="30d" />
        {d.topItems.length === 0 ? (
          <Empty>Not enough sales to rank items.</Empty>
        ) : (
          <Table
            head={['Item', 'Qty', 'Revenue']}
            rows={d.topItems.map((i) => [i.name, String(i.qty), formatINR(i.revenuePaise)])}
            alignRight={[1, 2]}
          />
        )}
      </Card>
    </div>
  );
}

/* ============================= Inventory ============================= */
function Inventory({ d }: { d: InventoryData }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Kpi label="Stock value" value={formatINR(d.totalValuePaise)} />
      <Kpi label="Tracked items" value={String(d.counts.items)} />
      <Kpi label="Low stock" value={String(d.counts.low)} tone={d.counts.low ? 'gold' : undefined} />
      <Kpi label="Critical" value={String(d.counts.critical)} tone={d.counts.critical ? 'clay' : undefined} />

      <Card className="col-span-2 lg:col-span-4 p-5">
        <CardHead title="Stock on hand" hint="lowest first" />
        {d.items.length === 0 ? (
          <Empty>No stock items tracked yet. Add ingredients to monitor levels, value and waste.</Empty>
        ) : (
          <div className="grid gap-1.5">
            {d.items.map((s) => (
              <div key={s.id} className="flex items-center gap-2.5 py-2 px-2.5 rounded-lg" style={{ background: 'var(--paper-3)' }}>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dotFor(s.status) }} />
                <b className="text-sm flex-1 min-w-0 truncate">{s.name}</b>
                <span className="text-sm tnum" style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-2)' }}>
                  {trim(s.onHand)} {s.unit}
                </span>
                <span className="text-xs tnum hidden sm:inline" style={{ color: 'var(--ink-3)' }}>
                  reorder {trim(s.reorder)}
                </span>
                <span className="text-sm tnum w-20 text-right hidden md:inline" style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-2)' }}>
                  {formatINR(s.valuePaise)}
                </span>
                {s.status !== 'ok' && (
                  <span className="pill text-[10px]" style={{ color: s.status === 'critical' ? 'var(--clay)' : 'var(--ink-2)' }}>{s.status}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="col-span-2 lg:col-span-4 p-5">
        <CardHead title="Recent waste" hint="last 12 entries" />
        {d.waste.length === 0 ? (
          <Empty>No waste logged. Spoilage, spills and training pours show here.</Empty>
        ) : (
          <Table
            head={['Item', 'Qty', 'Reason', 'Cost', 'When']}
            rows={d.waste.map((w) => [w.name, `${trim(w.qty)} ${w.unit}`, w.reason, formatINR(w.costPaise), rel(w.at)])}
            alignRight={[1, 3]}
          />
        )}
      </Card>
    </div>
  );
}

/* =============================== Staff =============================== */
function Staff({ d, refresh }: { d: StaffData; refresh: () => void }) {
  const [activeTab, setActiveTab] = useState<'directory' | 'shifts' | 'attendance' | 'payroll'>('directory');
  const [modal, setModal] = useState<{
    type: 'add' | 'edit' | 'pin' | 'pay' | 'payout' | 'shift';
    member?: any;
  } | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [role, setRole] = useState('waiter');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [employeeCode, setEmployeeCode] = useState('');
  
  // Pay states
  const [payType, setPayType] = useState<string>('none');
  const [payRate, setPayRate] = useState(''); // in Rupees

  // Payout states
  const [payAmount, setPayAmount] = useState(''); // in Rupees
  const [payMethod, setPayMethod] = useState<'cash' | 'upi' | 'bank'>('cash');
  const [periodLabel, setPeriodLabel] = useState(d.period || new Date().toISOString().slice(0, 7));
  const [payNote, setPayNote] = useState('');

  // Shift states
  const [shiftStaffId, setShiftStaffId] = useState('');
  const [shiftStartsAt, setShiftStartsAt] = useState('');
  const [shiftEndsAt, setShiftEndsAt] = useState('');
  const [shiftRole, setShiftRole] = useState('');

  // Request status
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset inputs when modal opens/changes
  useEffect(() => {
    setError(null);
    setSubmitting(false);
    if (!modal) return;

    if (modal.type === 'add') {
      setName('');
      setRole('waiter');
      setPhone('');
      setPin('');
      setEmployeeCode('');
    } else if (modal.type === 'edit' && modal.member) {
      setName(modal.member.name || '');
      setRole(modal.member.role || 'waiter');
      setPhone(modal.member.phone || '');
      setEmployeeCode(modal.member.employeeCode || '');
    } else if (modal.type === 'pin' && modal.member) {
      setPin('');
    } else if (modal.type === 'pay' && modal.member) {
      setPayType(modal.member.payType || 'none');
      setPayRate(modal.member.payRatePaise ? (modal.member.payRatePaise / 100).toString() : '');
      setEmployeeCode(modal.member.employeeCode || '');
    } else if (modal.type === 'payout' && modal.member) {
      setPayAmount('');
      setPayMethod('cash');
      setPeriodLabel(d.period || new Date().toISOString().slice(0, 7));
      setPayNote('');
    } else if (modal.type === 'shift') {
      setShiftStaffId(d.members.find(m => m.active)?.id || '');
      setShiftStartsAt('');
      setShiftEndsAt('');
      setShiftRole('');
    }
  }, [modal, d.period, d.members]);

  const handlePost = async (body: any) => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      refresh();
      setModal(null);
    } catch (e: any) {
      setError(e.message || 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  const active = d.members.filter((m) => m.active).length;
  const onShiftNow = d.attendanceToday.filter((a) => a.present).length;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* KPIs */}
      <Kpi label="Team members" value={String(d.members.length)} />
      <Kpi label="Active members" value={String(active)} />
      <Kpi label="On shift now" value={String(onShiftNow)} tone={onShiftNow ? 'cardamom' : undefined} />
      <Kpi label="Selling staff (30d)" value={String(d.sales.filter((s) => s.staffId).length)} />

      {/* Tabs and Actions Row */}
      <div className="col-span-1 md:col-span-2 lg:col-span-4 flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-line pb-2 gap-4">
        <div className="flex gap-2 overflow-x-auto w-full sm:w-auto">
          {(['directory', 'shifts', 'attendance', 'payroll'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`px-4 py-2 border-b-2 font-medium text-sm transition-all whitespace-nowrap capitalize ${
                activeTab === t
                  ? 'border-turmeric text-turmeric font-semibold'
                  : 'border-transparent text-ink-3 hover:text-ink'
              }`}
            >
              {t === 'directory' ? 'Team Directory' : t === 'shifts' ? 'Shifts & Roster' : t}
            </button>
          ))}
        </div>

        <div>
          {activeTab === 'directory' && (
            <button
              onClick={() => setModal({ type: 'add' })}
              className="px-4 py-2 rounded-lg bg-turmeric text-[#2A1607] font-semibold text-sm hover:brightness-110 active:scale-95 transition-all flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              Add Staff Member
            </button>
          )}
          {activeTab === 'shifts' && (
            <button
              onClick={() => setModal({ type: 'shift' })}
              className="px-4 py-2 rounded-lg bg-turmeric text-[#2A1607] font-semibold text-sm hover:brightness-110 active:scale-95 transition-all flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              Schedule Shift
            </button>
          )}
        </div>
      </div>

      {/* Main Tab Content */}
      <div className="col-span-1 md:col-span-2 lg:col-span-4">
        {activeTab === 'directory' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {d.members.map((m) => (
              <Card key={m.id} className="p-5 flex flex-col justify-between h-full min-h-[220px]">
                <div>
                  <div className="flex justify-between items-start gap-2 mb-3">
                    <div className="flex items-center gap-3">
                      <span className="grid place-items-center w-10 h-10 rounded-full text-base font-bold shrink-0" style={{ background: 'var(--turmeric-l)', color: '#2A1607' }}>
                        {initials(m.name)}
                      </span>
                      <div className="min-w-0">
                        <h4 className="font-semibold text-base truncate" title={m.name}>{m.name}</h4>
                        <span className="text-xs px-2 py-0.5 rounded bg-paper-3 border border-line font-medium capitalize text-ink-2">
                          {ROLE_LABELS[m.role as StaffRole] || m.role}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {!m.active && <span className="pill text-[10px] text-red-500 bg-red-500/10 border border-red-500/20">Inactive</span>}
                      {m.active && <span className="pill text-[10px] text-green-500 bg-green-500/10 border border-green-500/20">Active</span>}
                    </div>
                  </div>

                  <div className="text-sm space-y-1.5 mb-4 text-ink-2">
                    {m.employeeCode && (
                      <div className="flex justify-between">
                        <span>Code:</span>
                        <span className="font-semibold text-ink">{m.employeeCode}</span>
                      </div>
                    )}
                    {m.phone && (
                      <div className="flex justify-between">
                        <span>Phone:</span>
                        <span className="font-semibold text-ink">{m.phone}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span>POS PIN:</span>
                      <span className="font-semibold text-ink">{m.hasPin ? '🔑 Set' : '❌ Not Set'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Pay Rate:</span>
                      <span className="font-semibold text-ink">
                        {m.payType === 'hourly' && m.payRatePaise ? `${formatINR(m.payRatePaise)}/hr` :
                         m.payType === 'monthly' && m.payRatePaise ? `${formatINR(m.payRatePaise)}/mo` : 'Not configured'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-auto pt-3 border-t border-line">
                  <button
                    onClick={() => setModal({ type: 'edit', member: m })}
                    className="px-2 py-1.5 rounded bg-paper-3 hover:bg-line text-xs font-semibold text-center transition-all"
                  >
                    Edit Info
                  </button>
                  <button
                    onClick={() => setModal({ type: 'pin', member: m })}
                    className="px-2 py-1.5 rounded bg-paper-3 hover:bg-line text-xs font-semibold text-center transition-all"
                  >
                    Reset PIN
                  </button>
                  <button
                    onClick={() => setModal({ type: 'pay', member: m })}
                    className="px-2 py-1.5 rounded bg-paper-3 hover:bg-line text-xs font-semibold text-center transition-all"
                  >
                    Pay Settings
                  </button>
                  {m.active ? (
                    <button
                      onClick={() => {
                        if (confirm(`Deactivate ${m.name}?`)) {
                          handlePost({ action: 'remove', id: m.id });
                        }
                      }}
                      className="px-2 py-1.5 rounded bg-red-950/20 hover:bg-red-950/40 text-red-500 text-xs font-semibold text-center transition-all"
                    >
                      Deactivate
                    </button>
                  ) : (
                    <button
                      onClick={() => handlePost({ action: 'update', id: m.id, active: true })}
                      className="px-2 py-1.5 rounded bg-green-950/20 hover:bg-green-950/40 text-green-500 text-xs font-semibold text-center transition-all"
                    >
                      Reactivate
                    </button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}

        {activeTab === 'shifts' && (
          <div className="grid gap-4">
            <Card className="p-5">
              <CardHead title="Upcoming shifts & schedule" hint={`${d.shifts.length} shift(s) scheduled`} />
              {d.shifts.length === 0 ? (
                <Empty>No scheduled shifts. Click &quot;Schedule Shift&quot; above to assign tasks.</Empty>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--line)' }}>
                        <th className="pb-2 text-left text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>Staff Name</th>
                        <th className="pb-2 text-left text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>Schedule</th>
                        <th className="pb-2 text-left text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>Role Override</th>
                        <th className="pb-2 text-right text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.shifts.map((s) => (
                        <tr key={s.id} style={{ borderBottom: '1px solid var(--line)' }}>
                          <td className="py-3 font-semibold text-ink">{s.name}</td>
                          <td className="py-3 text-ink-2">{formatShiftTime(s.startsAt, s.endsAt)}</td>
                          <td className="py-3 text-ink-2 capitalize">{s.role ? (ROLE_LABELS[s.role as StaffRole] || s.role) : '—'}</td>
                          <td className="py-3 text-right">
                            <button
                              onClick={() => {
                                if (confirm(`Remove this shift for ${s.name}?`)) {
                                  handlePost({ action: 'shift_remove', shiftId: s.id });
                                }
                              }}
                              className="text-red-500 hover:text-red-400 font-semibold text-xs transition-all"
                            >
                              Cancel Shift
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        )}

        {activeTab === 'attendance' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Left/Middle: Live Attendance Today */}
            <Card className="col-span-1 lg:col-span-2 p-5">
              <CardHead title="Today's Attendance punches" hint={`${d.attendanceToday.filter(a => a.present).length} currently active`} />
              {d.attendanceToday.length === 0 ? (
                <Empty>No check-ins today. Staff can clock-in using their PIN at the POS.</Empty>
              ) : (
                <div className="grid gap-2">
                  {d.attendanceToday.map((a) => (
                    <div key={a.staffId} className="flex items-center justify-between p-3 rounded-lg bg-paper-3 border border-line">
                      <div className="flex items-center gap-3">
                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${a.present ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`} />
                        <div>
                          <b className="text-sm block">{a.name}</b>
                          <span className="text-xs text-ink-3">
                            In: {a.clockIn ? new Date(a.clockIn).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : '—'}
                            {a.clockOut ? ` · Out: ${new Date(a.clockOut).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}` : ''}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-semibold font-mono">{a.minutes} min</span>
                        <span className="block text-[10px] text-ink-3">{a.present ? 'on shift' : 'completed'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Right: Last 12 entries */}
            <Card className="p-5">
              <CardHead title="Recent attendance history" hint="Last 12 logs" />
              {d.attendance.length === 0 ? (
                <Empty>No historic attendance recorded.</Empty>
              ) : (
                <div className="space-y-3">
                  {d.attendance.map((a) => (
                    <div key={a.id} className="text-xs border-b border-line pb-2">
                      <div className="flex justify-between font-semibold text-ink mb-1">
                        <span>{a.name}</span>
                        <span className={!a.clockOut ? 'text-green-500' : 'text-ink-3'}>
                          {!a.clockOut ? 'Clocked In' : 'Completed'}
                        </span>
                      </div>
                      <div className="text-ink-2 flex flex-col">
                        <span>In: {dt(a.clockIn)}</span>
                        {a.clockOut && <span>Out: {dt(a.clockOut)}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}

        {activeTab === 'payroll' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Left: Payroll structure & payouts */}
            <Card className="col-span-1 lg:col-span-2 p-5">
              <CardHead title={`Payroll Period · ${d.period}`} hint="Active team wages" />
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--line)' }}>
                      <th className="pb-2 text-left text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>Name</th>
                      <th className="pb-2 text-left text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>Wage Plan</th>
                      <th className="pb-2 text-right text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>Paid this Period</th>
                      <th className="pb-2 text-right text-xs font-semibold" style={{ color: 'var(--ink-3)' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.payroll.map((p) => {
                      const member = d.members.find(m => m.id === p.staffId);
                      if (!member?.active) return null;
                      return (
                        <tr key={p.staffId} style={{ borderBottom: '1px solid var(--line)' }}>
                          <td className="py-3 font-semibold text-ink">{p.name}</td>
                          <td className="py-3 text-ink-2">
                            {p.payType === 'hourly' && p.payRatePaise ? `${formatINR(p.payRatePaise)}/hr` :
                             p.payType === 'monthly' && p.payRatePaise ? `${formatINR(p.payRatePaise)}/mo` : 'Not configured'}
                          </td>
                          <td className="py-3 text-right font-mono text-ink font-semibold">
                            {formatINR(p.paidThisPeriodPaise)}
                          </td>
                          <td className="py-3 text-right">
                            <button
                              onClick={() => setModal({ type: 'payout', member: member })}
                              className="px-2 py-1 rounded bg-turmeric text-[#2A1607] font-bold text-xs hover:brightness-110 active:scale-95 transition-all"
                            >
                              Record Pay
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Right: Payment Logs */}
            <Card className="p-5">
              <CardHead title="Recent payroll ledger" hint="This period" />
              {d.payroll.flatMap(p => p.recent).length === 0 ? (
                <Empty>No salary payments recorded this period.</Empty>
              ) : (
                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                  {d.payroll
                    .flatMap((p) => p.recent.map((r) => ({ ...r, staffName: p.name })))
                    .sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime())
                    .map((pay) => (
                      <div key={pay.id} className="text-xs border-b border-line pb-2">
                        <div className="flex justify-between font-semibold text-ink mb-1">
                          <span>{pay.staffName}</span>
                          <span className="font-mono text-turmeric-d">{formatINR(pay.amountPaise)}</span>
                        </div>
                        <div className="text-ink-3 flex justify-between">
                          <span>Method: <b className="capitalize">{pay.method}</b></span>
                          <span>{new Date(pay.paidAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </Card>
          </div>
        )}
      </div>

      {/* Modals */}
      {modal && (
        <div 
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-all"
          onClick={() => !submitting && setModal(null)}
        >
          <div 
            className="bg-paper-3 border border-line rounded-xl shadow-2xl w-full max-w-md p-6 overflow-hidden animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex justify-between items-center border-b border-line pb-3 mb-4">
              <h3 className="font-semibold text-lg">
                {modal.type === 'add' && 'Add New Staff Member'}
                {modal.type === 'edit' && `Edit ${modal.member?.name}`}
                {modal.type === 'pin' && `Reset PIN for ${modal.member?.name}`}
                {modal.type === 'pay' && `Compensation Settings: ${modal.member?.name}`}
                {modal.type === 'payout' && `Record Payout: ${modal.member?.name}`}
                {modal.type === 'shift' && 'Schedule Shift'}
              </h3>
              <button 
                disabled={submitting} 
                onClick={() => setModal(null)}
                className="text-ink-3 hover:text-ink transition-all disabled:opacity-50"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-4 p-3 rounded bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-semibold">
                ⚠️ Error: {error === 'pin_in_use' ? 'PIN is already in use by another staff member' : 
                          error === 'pin_must_be_4_to_6_digits' ? 'PIN must be between 4 and 6 digits (numbers only)' : error}
              </div>
            )}

            {/* Modal Body / Form */}
            <form onSubmit={(e) => {
              e.preventDefault();
              if (submitting) return;

              if (modal.type === 'add') {
                if (!name.trim()) return setError('Name is required');
                if (!/^\d{4,6}$/.test(pin)) return setError('PIN must be 4 to 6 numeric digits');
                handlePost({ action: 'create', name, role, phone: phone || null, pin, employeeCode: employeeCode || null });
              } else if (modal.type === 'edit') {
                if (!name.trim()) return setError('Name is required');
                handlePost({ action: 'update', id: modal.member.id, name, role, phone: phone || null, employeeCode: employeeCode || null });
              } else if (modal.type === 'pin') {
                if (!/^\d{4,6}$/.test(pin)) return setError('PIN must be 4 to 6 numeric digits');
                handlePost({ action: 'setpin', id: modal.member.id, pin });
              } else if (modal.type === 'pay') {
                const parsedRate = payType === 'none' ? null : Math.round(Number(payRate) * 100);
                if (payType !== 'none' && (isNaN(parsedRate || 0) || (parsedRate || 0) < 0)) {
                  return setError('Pay rate must be a valid positive number');
                }
                handlePost({
                  action: 'set_pay',
                  id: modal.member.id,
                  payType: payType === 'none' ? null : payType,
                  payRatePaise: parsedRate,
                  employeeCode: employeeCode || null
                });
              } else if (modal.type === 'payout') {
                const parsedAmount = Math.round(Number(payAmount) * 100);
                if (isNaN(parsedAmount) || parsedAmount <= 0) {
                  return setError('Payout amount must be a positive number');
                }
                handlePost({
                  action: 'pay_record',
                  id: modal.member.id,
                  amountPaise: parsedAmount,
                  method: payMethod,
                  periodLabel,
                  note: payNote || null
                });
              } else if (modal.type === 'shift') {
                if (!shiftStaffId) return setError('Staff member is required');
                if (!shiftStartsAt) return setError('Start date/time is required');
                if (!shiftEndsAt) return setError('End date/time is required');
                if (new Date(shiftEndsAt) <= new Date(shiftStartsAt)) return setError('End time must be after start time');
                handlePost({
                  action: 'shift_add',
                  staffId: shiftStaffId,
                  startsAt: new Date(shiftStartsAt).toISOString(),
                  endsAt: new Date(shiftEndsAt).toISOString(),
                  role: shiftRole || null
                });
              }
            }}>
              {/* Form Fields: Add / Edit */}
              {(modal.type === 'add' || modal.type === 'edit') && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold mb-1 text-ink-2">Full Name</label>
                    <input 
                      type="text" 
                      required
                      value={name} 
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Rahul Sharma"
                      className="w-full px-3 py-2 rounded bg-paper-3 border border-line text-ink focus:outline-none focus:border-turmeric text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1 text-ink-2">Role</label>
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                      className="w-full px-3 py-2 rounded bg-paper-3 border border-line text-ink focus:outline-none focus:border-turmeric text-sm cursor-pointer"
                    >
                      {ALL_ROLES.map((r) => (
                        <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1 text-ink-2">Phone Number (Optional)</label>
                    <input 
                      type="tel" 
                      value={phone} 
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="e.g. +91 9876543210"
                      className="w-full px-3 py-2 rounded bg-paper-3 border border-line text-ink focus:outline-none focus:border-turmeric text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1 text-ink-2">Employee Code (Optional)</label>
                    <input 
                      type="text" 
                      value={employeeCode} 
                      onChange={(e) => setEmployeeCode(e.target.value)}
                      placeholder="e.g. EMP102"
                      className="w-full px-3 py-2 rounded bg-paper-3 border border-line text-ink focus:outline-none focus:border-turmeric text-sm"
                    />
                  </div>
                  {modal.type === 'add' && (
                    <div>
                      <label className="block text-xs font-semibold mb-1 text-ink-2">Numeric POS PIN (4 to 6 digits)</label>
                      <input 
                        type="password" 
                        pattern="\d*"
                        minLength={4}
                        maxLength={6}
                        required
                        value={pin} 
                        onChange={(e) => setPin(e.target.value)}
                        placeholder="e.g. 1478"
                        className="w-full px-3 py-2 rounded bg-paper-3 border border-line text-ink focus:outline-none focus:border-turmeric text-sm font-mono tracking-widest"
                      />
                      <span className="text-[10px] text-ink-3 mt-1 block">This PIN is hashed. Staff will use it to clock-in/out and log in at the POS terminal.</span>
                    </div>
                  )}
                </div>
              )}

              {/* Form Fields: Reset PIN */}
              {modal.type === 'pin' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold mb-1 text-ink-2">New Numeric PIN (4 to 6 digits)</label>
                    <input 
                      type="password" 
                      pattern="\d*"
                      minLength={4}
                      maxLength={6}
                      required
                      value={pin} 
                      onChange={(e) => setPin(e.target.value)}
                      placeholder="Enter new pin"
                      className="w-full px-3 py-2 rounded bg-paper-3 border border-line text-ink focus:outline-none focus:border-turmeric text-sm font-mono tracking-widest"
                    />
                  </div>
                </div>
              )}

              {/* Form Fields: Pay Config */}
              {modal.type === 'pay' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold mb-1 text-ink-2">Wage Configuration</label>
                    <select
                      value={payType}
                      onChange={(e) => setPayType(e.target.value)}
                      className="w-full px-3 py-2 rounded bg-paper-3 border border-line text-ink focus:outline-none focus:border-turmeric text-sm cursor-pointer"
                    >
                      <option value="none">No Set Rate / Unsalaried</option>
                      <option value="hourly">Hourly Rate</option>
                      <option value="monthly">Monthly Salary</option>
                    </select>
                  </div>
                  {payType !== 'none' && (
                    <div>
                      <label className="block text-xs font-semibold mb-1 text-ink-2">
                        Rate (in Rupees ₹)
                      </label>
                      <input 
                        type="number" 
                        required
                        min="0"
                        step="0.01"
                        value={payRate} 
                        onChange={(e) => setPayRate(e.target.value)}
                        placeholder={payType === 'hourly' ? 'e.g. 150' : 'e.g. 15000'}
                        className="w-full px-3 py-2 rounded bg-paper-3 border border-line text-ink focus:outline-none focus:border-turmeric text-sm font-mono"
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-semibold mb-1 text-ink-2">Employee Code (Optional)</label>
                    <input 
                      type="text" 
                      value={employeeCode} 
                      onChange={(e) => setEmployeeCode(e.target.value)}
                      placeholder="e.g. EMP102"
                      className="w-full px-3 py-2 rounded bg-paper-3 border border-line text-ink focus:outline-none focus:border-turmeric text-sm"
                    />
                  </div>
                </div>
              )}

              {/* Form Fields: Record Salary Payment */}
              {modal.type === 'payout' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold mb-1 text-ink-2">Staff Member</label>
                    <input 
                      type="text" 
                      disabled
                      value={modal.member?.name || ''}
                      className="w-full px-3 py-2 rounded bg-paper-3 border border-line text-ink-3 opacity-60 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1 text-ink-2">Amount Paid (Rupees ₹)</label>
                    <input 
                      type="number" 
                      required
                      min="0.01"
                      step="0.01"
                      value={payAmount} 
                      onChange={(e) => setPayAmount(e.target.value)}
                      placeholder="e.g. 5000"
                      className="w-full px-3 py-2 rounded bg-paper-3 border border-line text-ink focus:outline-none focus:border-turmeric text-sm font-mono"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold mb-1 text-ink-2">Payment Method</label>
                      <select
                        value={payMethod}
                        onChange={(e) => setPayMethod(e.target.value as any)}
                        className="w-full px-3 py-2 rounded bg-paper-3 border border-line text-ink focus:outline-none focus:border-turmeric text-sm cursor-pointer"
                      >
                        <option value="cash">Cash</option>
                        <option value="upi">UPI</option>
                        <option value="bank">Bank Transfer</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold mb-1 text-ink-2">Payroll Period</label>
                      <input 
                        type="text" 
                        required
                        value={periodLabel} 
                        onChange={(e) => setPeriodLabel(e.target.value)}
                        placeholder="YYYY-MM"
                        className="w-full px-3 py-2 rounded bg-paper-3 border border-line text-ink focus:outline-none focus:border-turmeric text-sm font-mono"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1 text-ink-2">Notes (Optional)</label>
                    <input 
                      type="text" 
                      value={payNote} 
                      onChange={(e) => setPayNote(e.target.value)}
                      placeholder="e.g. Part-payment or Advance salary"
                      className="w-full px-3 py-2 rounded bg-paper-3 border border-line text-ink focus:outline-none focus:border-turmeric text-sm"
                    />
                  </div>
                </div>
              )}

              {/* Form Fields: Schedule Shift */}
              {modal.type === 'shift' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold mb-1 text-ink-2">Staff Member</label>
                    <select
                      value={shiftStaffId}
                      onChange={(e) => setShiftStaffId(e.target.value)}
                      className="w-full px-3 py-2 rounded bg-paper-3 border border-line text-ink focus:outline-none focus:border-turmeric text-sm cursor-pointer"
                    >
                      {d.members.filter(m => m.active).map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1 text-ink-2">Starts At</label>
                    <input 
                      type="datetime-local" 
                      required
                      value={shiftStartsAt} 
                      onChange={(e) => setShiftStartsAt(e.target.value)}
                      className="w-full px-3 py-2 rounded bg-paper-3 border border-line text-ink focus:outline-none focus:border-turmeric text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1 text-ink-2">Ends At</label>
                    <input 
                      type="datetime-local" 
                      required
                      value={shiftEndsAt} 
                      onChange={(e) => setShiftEndsAt(e.target.value)}
                      className="w-full px-3 py-2 rounded bg-paper-3 border border-line text-ink focus:outline-none focus:border-turmeric text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1 text-ink-2">Role Override (Optional)</label>
                    <select
                      value={shiftRole}
                      onChange={(e) => setShiftRole(e.target.value)}
                      className="w-full px-3 py-2 rounded bg-paper-3 border border-line text-ink focus:outline-none focus:border-turmeric text-sm cursor-pointer"
                    >
                      <option value="">Default User Role</option>
                      {ALL_ROLES.map((r) => (
                        <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Form Action Buttons */}
              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-line">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setModal(null)}
                  className="px-4 py-2 rounded bg-paper-3 border border-line text-ink font-semibold text-sm hover:brightness-110 active:scale-95 transition-all disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded bg-turmeric text-[#2A1607] font-semibold text-sm hover:brightness-110 active:scale-95 transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <svg className="animate-spin h-4 w-4 text-[#2A1607]" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// shift details time formatter
function formatShiftTime(startsAt: string, endsAt: string) {
  const s = new Date(startsAt);
  const e = new Date(endsAt);
  const day = s.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  const startTime = s.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  const endTime = e.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${day} · ${startTime} - ${endTime}`;
}

/* ============================== Loyalty ============================== */
const TIER_COLOR: Record<string, string> = {
  bronze: 'var(--clay-l)',
  silver: 'var(--ink-3)',
  gold: 'var(--gold)',
  vip: 'var(--berry)',
};

function Loyalty({ d }: { d: LoyaltyData }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Kpi label="Customers" value={String(d.totals.customers)} />
      <Kpi label="Point liability" value={d.totals.pointsLiability.toLocaleString('en-IN')} />
      <Kpi label="Coupons issued" value={String(d.totals.couponsIssued)} />
      <Kpi label="Coupons redeemed" value={String(d.totals.couponsRedeemed)} />

      <Card className="col-span-2 p-5">
        <CardHead title="Tier breakdown" />
        {d.tiers.length === 0 ? (
          <Empty>No customers enrolled yet.</Empty>
        ) : (
          <div className="grid gap-2.5">
            {d.tiers.map((t) => (
              <div key={t.tier} className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: TIER_COLOR[t.tier] ?? 'var(--ink-3)' }} />
                <b className="text-sm capitalize flex-1">{t.tier}</b>
                <span className="text-sm tnum" style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-2)' }}>{t.count}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="col-span-2 p-5">
        <CardHead title="Games" />
        {d.games.length === 0 ? (
          <Empty>No games configured.</Empty>
        ) : (
          <div className="grid gap-1.5">
            {d.games.map((g) => (
              <div key={g.id} className="flex items-center gap-2.5 py-2 px-2.5 rounded-lg" style={{ background: 'var(--paper-3)' }}>
                <b className="text-sm flex-1">{g.name}</b>
                <span className="text-sm tnum" style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-2)' }}>{g.plays} plays</span>
                {!g.active && <span className="pill text-[10px]" style={{ color: 'var(--ink-3)' }}>off</span>}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="col-span-2 lg:col-span-2 p-5">
        <CardHead title="Top customers" hint="by lifetime spend" />
        {d.topCustomers.length === 0 ? (
          <Empty>No customers yet.</Empty>
        ) : (
          <Table
            head={['Customer', 'Tier', 'Visits', 'Points']}
            rows={d.topCustomers.map((c) => [c.name, c.tier, String(c.visits), c.points.toLocaleString('en-IN')])}
            alignRight={[2, 3]}
          />
        )}
      </Card>

      <Card className="col-span-2 p-5">
        <CardHead title="Rewards catalog" />
        {d.rewards.length === 0 ? (
          <Empty>No rewards configured.</Empty>
        ) : (
          <div className="grid gap-1.5">
            {d.rewards.map((r) => (
              <div key={r.id} className="flex items-center gap-2.5 py-2 px-2.5 rounded-lg" style={{ background: 'var(--paper-3)' }}>
                <b className="text-sm flex-1 min-w-0 truncate">{r.name}</b>
                <span className="text-xs" style={{ color: 'var(--ink-3)' }}>{r.type.replace('_', ' ')}</span>
                <span className="text-sm tnum" style={{ fontFamily: 'var(--font-mono)', color: 'var(--turmeric-d)' }}>{r.costPoints} pts</span>
                {!r.active && <span className="pill text-[10px]" style={{ color: 'var(--ink-3)' }}>off</span>}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ============================= Marketing ============================= */
function Marketing({ d }: { d: MarketingData }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Kpi label="Campaigns" value={String(d.campaigns.length)} />
      <Kpi label="Segments" value={String(d.segments.length)} />
      <Kpi label="Messages sent" value={String(d.campaigns.reduce((s, c) => s + c.sent, 0))} />
      <Kpi label="Rewards live" value={String(d.rewards.filter((r) => r.active).length)} />

      <Card className="col-span-2 lg:col-span-4 p-5">
        <CardHead title="Campaigns" />
        {d.campaigns.length === 0 ? (
          <Empty>No campaigns yet. WhatsApp / SMS / push blasts and their open & click rates will appear here.</Empty>
        ) : (
          <Table
            head={['Channel', 'Status', 'Scheduled', 'Sent', 'Opened', 'Clicked']}
            rows={d.campaigns.map((c) => [
              c.channel,
              c.status ?? 'draft',
              c.scheduledAt ? dt(c.scheduledAt) : '—',
              String(c.sent),
              String(c.opened),
              String(c.clicked),
            ])}
            alignRight={[3, 4, 5]}
          />
        )}
      </Card>

      <Card className="col-span-2 p-5">
        <CardHead title="Segments" />
        {d.segments.length === 0 ? (
          <Empty>No audience segments defined.</Empty>
        ) : (
          <div className="grid gap-1.5">
            {d.segments.map((s) => (
              <div key={s.id} className="py-2 px-2.5 rounded-lg text-sm" style={{ background: 'var(--paper-3)' }}><b>{s.name}</b></div>
            ))}
          </div>
        )}
      </Card>

      <Card className="col-span-2 p-5">
        <CardHead title="Rewards" />
        {d.rewards.length === 0 ? (
          <Empty>No rewards to promote.</Empty>
        ) : (
          <div className="grid gap-1.5">
            {d.rewards.map((r) => (
              <div key={r.id} className="flex items-center gap-2.5 py-2 px-2.5 rounded-lg" style={{ background: 'var(--paper-3)' }}>
                <b className="text-sm flex-1 min-w-0 truncate">{r.name}</b>
                <span className="text-sm tnum" style={{ fontFamily: 'var(--font-mono)', color: 'var(--turmeric-d)' }}>{r.costPoints} pts</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/* =============================== Menu =============================== */
const STATION_TAG: Record<string, string> = { bar: 'var(--turmeric)', kitchen: 'var(--cardamom)', dessert: 'var(--berry)' };

function Menu({ d }: { d: MenuData }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Kpi label="Menu items" value={String(d.counts.items)} />
      <Kpi label="Available" value={String(d.counts.available)} tone="cardamom" />
      <Kpi label="Hidden" value={String(d.counts.unavailable)} tone={d.counts.unavailable ? 'gold' : undefined} />
      <Kpi label="Categories" value={String(d.categories.length)} />

      {d.categories.length === 0 ? (
        <Card className="col-span-2 lg:col-span-4 p-5"><Empty>No menu yet.</Empty></Card>
      ) : (
        d.categories.map((c) => (
          <Card key={c.id} className="col-span-2 p-5">
            <CardHead title={c.name} hint={`${c.items.length} item${c.items.length === 1 ? '' : 's'}`} />
            {c.items.length === 0 ? (
              <Empty>No items in this category.</Empty>
            ) : (
              <div className="grid gap-1.5">
                {c.items.map((i) => (
                  <div key={i.id} className="flex items-center gap-2.5 py-2 px-2.5 rounded-lg" style={{ background: 'var(--paper-3)', opacity: i.isAvailable ? 1 : 0.55 }}>
                    {i.station && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: STATION_TAG[i.station] ?? 'var(--ink-3)' }} title={i.station} />}
                    <b className="text-sm flex-1 min-w-0 truncate">{i.name}</b>
                    <span className="text-[10px]" style={{ color: 'var(--ink-3)' }}>GST {i.gstRate}%</span>
                    <span className="text-sm tnum" style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-2)' }}>{formatINR(i.pricePaise)}</span>
                    {!i.isAvailable && <span className="pill text-[10px]" style={{ color: 'var(--ink-3)' }}>hidden</span>}
                  </div>
                ))}
              </div>
            )}
          </Card>
        ))
      )}
    </div>
  );
}

/* ============================== Settings ============================== */
function Settings({ d }: { d: SettingsData }) {
  const addr = d.outlet.address;
  const addrStr = addr
    ? [addr.line1, addr.city, addr.pincode].filter(Boolean).join(', ')
    : '—';
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Card className="col-span-2 p-5">
        <CardHead title="Outlet" />
        <Rows
          rows={[
            ['Name', d.outlet.name],
            ['Address', addrStr],
            ['GSTIN', d.outlet.gstin ?? '—'],
            ['State code', d.outlet.stateCode ?? '—'],
            ['Timezone', d.outlet.timezone],
            ['Tables', String(d.tableCount)],
          ]}
        />
      </Card>

      <Card className="col-span-2 p-5">
        <CardHead title="Business" />
        <Rows
          rows={[
            ['Brand', d.tenant.name],
            ['Plan', d.tenant.plan],
            ['GSTIN', d.tenant.gstin ?? '—'],
            ['Team members', String(d.staffCount)],
          ]}
        />
        <p className="text-xs mt-4" style={{ color: 'var(--ink-3)' }}>
          Outlet name, address and timezone are read-only for now.
        </p>
      </Card>
    </div>
  );
}

/* =========================== shared primitives =========================== */
function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="font-display text-2xl md:text-3xl">{title}</h2>
    </div>
  );
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>;
}

function CardHead({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h4 className="text-base font-bold">{title}</h4>
      {hint && <span className="text-xs" style={{ color: 'var(--ink-3)' }}>{hint}</span>}
    </div>
  );
}

const TONE: Record<string, string> = {
  clay: 'var(--clay)',
  gold: 'var(--gold)',
  cardamom: 'var(--cardamom-d)',
};

function Kpi({ label, value, tone }: { label: string; value: string; tone?: keyof typeof TONE }) {
  return (
    <section className="card p-4">
      <span className="block text-xs mb-2" style={{ color: 'var(--ink-3)' }}>{label}</span>
      <span className="block text-2xl md:text-3xl font-bold tnum" style={{ fontFamily: 'var(--font-mono)', color: tone ? TONE[tone] : undefined }}>{value}</span>
    </section>
  );
}

function Bar({ pct }: { pct: number }) {
  return (
    <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--paper-3)' }}>
      <div className="h-full rounded-full" style={{ width: `${Math.max(2, pct)}%`, background: 'var(--turmeric)' }} />
    </div>
  );
}

function Table({ head, rows, alignRight = [] }: { head: string[]; rows: string[][]; alignRight?: number[] }) {
  const ar = new Set(alignRight);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i} className={`pb-2 font-semibold text-xs ${ar.has(i) ? 'text-right' : 'text-left'}`} style={{ color: 'var(--ink-3)', borderBottom: '1px solid var(--line)' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri}>
              {r.map((c, ci) => (
                <td
                  key={ci}
                  className={`py-2 ${ar.has(ci) ? 'text-right tnum' : 'text-left'} ${ci === 0 ? 'font-semibold' : ''}`}
                  style={{ borderBottom: '1px solid var(--line)', fontFamily: ar.has(ci) ? 'var(--font-mono)' : undefined, color: ci === 0 ? 'var(--ink)' : 'var(--ink-2)' }}
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <div className="grid gap-2">
      {rows.map(([k, v], i) => (
        <div key={i} className="flex items-center justify-between gap-3 py-1.5" style={{ borderBottom: i < rows.length - 1 ? '1px solid var(--line)' : undefined }}>
          <span className="text-sm" style={{ color: 'var(--ink-3)' }}>{k}</span>
          <b className="text-sm text-right capitalize">{v}</b>
        </div>
      ))}
    </div>
  );
}

function Loading() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="card p-4" style={{ height: 96 }}>
          <div className="h-3 w-16 rounded mb-3" style={{ background: 'var(--paper-3)', animation: 'shimmer 1.4s infinite' }} />
          <div className="h-7 w-24 rounded" style={{ background: 'var(--paper-3)', animation: 'shimmer 1.4s infinite' }} />
        </div>
      ))}
      <style>{`@keyframes shimmer{0%,100%{opacity:.5}50%{opacity:1}}`}</style>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm py-6 text-center" style={{ color: 'var(--ink-3)' }}>{children}</p>;
}

/* ------------------------------- helpers ------------------------------- */
const dotFor = (s: string) => (s === 'critical' ? 'var(--clay)' : s === 'low' ? 'var(--gold)' : 'var(--cardamom)');
const trim = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const initials = (n: string) =>
  n.replace(/\(.*?\)/g, '').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';
function dt(iso: string) {
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}
function rel(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3.6e6);
  if (h < 1) return `${Math.max(1, Math.floor(diff / 6e4))}m ago`;
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
