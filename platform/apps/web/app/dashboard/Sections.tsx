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
export function SectionView({ section, title }: { section: SectionData['section']; title: string }) {
  const [state, setState] = useState<{ loading: boolean; error: string | null; payload: SectionData | null }>({
    loading: true,
    error: null,
    payload: null,
  });

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
      <SectionHeader title={title} />
      {state.loading && <Loading />}
      {state.error && <Card><Empty>Couldn’t load this section — {state.error}. Try Refresh.</Empty></Card>}
      {state.payload && <SectionBody payload={state.payload} />}
    </div>
  );
}

function SectionBody({ payload }: { payload: SectionData }) {
  switch (payload.section) {
    case 'sales':
      return <Sales d={payload.data} />;
    case 'inventory':
      return <Inventory d={payload.data} />;
    case 'staff':
      return <Staff d={payload.data} />;
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
function Staff({ d }: { d: StaffData }) {
  const active = d.members.filter((m) => m.active).length;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Kpi label="Team members" value={String(d.members.length)} />
      <Kpi label="Active" value={String(active)} />
      <Kpi label="On shift now" value={String(d.attendance.filter((a) => !a.clockOut).length)} />
      <Kpi label="Selling staff" value={String(d.sales.filter((s) => s.staffId).length)} />

      <Card className="col-span-2 p-5">
        <CardHead title="Team" />
        <div className="grid gap-1.5">
          {d.members.map((m) => (
            <div key={m.id} className="flex items-center gap-2.5 py-2 px-2.5 rounded-lg" style={{ background: 'var(--paper-3)' }}>
              <span className="grid place-items-center w-8 h-8 rounded-full text-sm font-bold shrink-0" style={{ background: 'var(--turmeric-l)', color: '#2A1607' }}>
                {initials(m.name)}
              </span>
              <div className="flex-1 min-w-0">
                <b className="text-sm block truncate">{m.name}</b>
                <span className="text-xs capitalize" style={{ color: 'var(--ink-3)' }}>{m.role}{m.phone ? ` · ${m.phone}` : ''}</span>
              </div>
              {!m.active && <span className="pill text-[10px]" style={{ color: 'var(--ink-3)' }}>inactive</span>}
            </div>
          ))}
        </div>
      </Card>

      <Card className="col-span-2 p-5">
        <CardHead title="Sales by staff" hint="30d" />
        {d.sales.length === 0 ? (
          <Empty>No attributed orders yet.</Empty>
        ) : (
          <Table
            head={['Staff', 'Orders', 'Revenue']}
            rows={d.sales.map((s) => [s.name, String(s.orders), formatINR(s.grossPaise)])}
            alignRight={[1, 2]}
          />
        )}
      </Card>

      <Card className="col-span-2 lg:col-span-4 p-5">
        <CardHead title="Recent attendance" hint="last 12 clock-ins" />
        {d.attendance.length === 0 ? (
          <Empty>No clock-ins recorded yet.</Empty>
        ) : (
          <Table
            head={['Staff', 'Clock in', 'Clock out']}
            rows={d.attendance.map((a) => [a.name, dt(a.clockIn), a.clockOut ? dt(a.clockOut) : 'on shift'])}
          />
        )}
      </Card>
    </div>
  );
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
          Editing these settings is coming next — values are read-only for now.
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
