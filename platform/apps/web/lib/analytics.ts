import { prisma } from '@cafeos/db';

/**
 * Cafe OS — Owner Dashboard analytics.
 *
 * Everything here is computed from the REAL Postgres data (orders, items,
 * payments, stock, customers). No mock numbers — an outlet with no orders yet
 * shows honest zeros and empty states. Time buckets are computed in the
 * outlet's wall-clock zone (Asia/Kolkata) so "today" matches the cafe's day.
 *
 * Money is integer paise throughout (see @cafeos/core). Raw aggregates cast to
 * ::int in SQL so Prisma returns plain numbers (not BigInt) — JSON-safe.
 */
const TZ = 'Asia/Kolkata';

export interface Kpi {
  todaySalesPaise: number;
  todayOrders: number;
  aovPaise: number;
  footfall: number; // distinct guests served today (customers + walk-in covers)
  salesDeltaPct: number | null; // vs yesterday
  ordersDeltaPct: number | null;
}

export interface TrendPoint {
  label: string; // "We"
  date: string; // "2026-06-13"
  orders: number;
  grossPaise: number;
}

export interface MenuDot {
  itemId: string;
  name: string;
  qty: number;
  revenuePaise: number;
  pop: number; // 0..100 popularity (x)
  profit: number; // 0..100 margin proxy (y)
  quad: 'star' | 'plowhorse' | 'puzzle' | 'dog';
}

export interface LowStock {
  id: string;
  name: string;
  qty: string; // "1.2 kg"
  level: 'critical' | 'low';
}

export interface LoyaltySnapshot {
  customers: number;
  repeatPct: number;
  gamesPlayed: number;
  pointsLiability: number;
  qrScanPct: number; // share of orders opened from a table QR
}

export interface Brief {
  tone: 'up' | 'warn' | 'tip';
  text: string;
  action: string;
}

export interface DashboardData {
  kpi: Kpi;
  trend: TrendPoint[];
  hourly: number[]; // 24 buckets, orders by hour-of-day (last 7d)
  topItems: { name: string; qty: number; revenuePaise: number }[];
  menuQuadrant: MenuDot[];
  lowStock: LowStock[];
  loyalty: LoyaltySnapshot;
  briefing: Brief[];
}

const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export async function getDashboardData(outletId: string): Promise<DashboardData> {
  const [today, yesterday, trendRows, hourRows, itemRows, stock, loyalty, qr] =
    await Promise.all([
      todayKpis(outletId, 0),
      todayKpis(outletId, 1),
      trend(outletId),
      hourly(outletId),
      itemAgg(outletId),
      lowStock(outletId),
      loyaltySnapshot(outletId),
      qrShare(outletId),
    ]);

  const aovPaise = today.orders > 0 ? Math.round(today.gross / today.orders) : 0;

  const kpi: Kpi = {
    todaySalesPaise: today.gross,
    todayOrders: today.orders,
    aovPaise,
    footfall: today.footfall,
    salesDeltaPct: pctDelta(today.gross, yesterday.gross),
    ordersDeltaPct: pctDelta(today.orders, yesterday.orders),
  };

  const menuQuadrant = toQuadrant(itemRows);
  const topItems = itemRows
    .slice()
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 6)
    .map((i) => ({ name: i.name, qty: i.qty, revenuePaise: i.revenue }));

  return {
    kpi,
    trend: trendRows,
    hourly: hourRows,
    topItems,
    menuQuadrant,
    lowStock: stock,
    loyalty: { ...loyalty, qrScanPct: qr },
    briefing: buildBriefing(kpi, trendRows, hourRows, topItems, stock),
  };
}

// --------------------------- KPIs ---------------------------
async function todayKpis(outletId: string, daysAgo: number) {
  const rows = await prisma.$queryRaw<
    { orders: number; gross: number; footfall: number }[]
  >`
    SELECT
      COUNT(*)::int AS orders,
      COALESCE(SUM("totalPaise"), 0)::int AS gross,
      (COUNT(DISTINCT "customerId")
        + COUNT(*) FILTER (WHERE "customerId" IS NULL))::int AS footfall
    FROM orders
    WHERE "outletId" = ${outletId}::uuid
      AND "status" <> 'cancelled'
      AND ("placedAt" AT TIME ZONE ${TZ})::date
          = (now() AT TIME ZONE ${TZ})::date - ${daysAgo}::int
  `;
  return rows[0] ?? { orders: 0, gross: 0, footfall: 0 };
}

// --------------------------- 7-day trend ---------------------------
async function trend(outletId: string): Promise<TrendPoint[]> {
  const rows = await prisma.$queryRaw<
    { day: Date; orders: number; gross: number }[]
  >`
    SELECT
      ("placedAt" AT TIME ZONE ${TZ})::date AS day,
      COUNT(*)::int AS orders,
      COALESCE(SUM("totalPaise"), 0)::int AS gross
    FROM orders
    WHERE "outletId" = ${outletId}::uuid
      AND "status" <> 'cancelled'
      AND ("placedAt" AT TIME ZONE ${TZ})::date
          > (now() AT TIME ZONE ${TZ})::date - 7
    GROUP BY 1
  `;
  const byDay = new Map(rows.map((r) => [iso(r.day), r]));

  // fill the last 7 days (oldest → newest) so the chart never has gaps
  const out: TrendPoint[] = [];
  const base = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    const key = iso(d);
    const hit = byDay.get(key);
    out.push({
      label: DOW[d.getDay()]!,
      date: key,
      orders: hit?.orders ?? 0,
      grossPaise: hit?.gross ?? 0,
    });
  }
  return out;
}

// --------------------------- hourly heatmap ---------------------------
async function hourly(outletId: string): Promise<number[]> {
  const rows = await prisma.$queryRaw<{ hour: number; n: number }[]>`
    SELECT
      EXTRACT(HOUR FROM ("placedAt" AT TIME ZONE ${TZ}))::int AS hour,
      COUNT(*)::int AS n
    FROM orders
    WHERE "outletId" = ${outletId}::uuid
      AND "status" <> 'cancelled'
      AND "placedAt" >= now() - interval '7 days'
    GROUP BY 1
  `;
  const buckets = new Array(24).fill(0);
  for (const r of rows) buckets[r.hour] = r.n;
  return buckets;
}

// --------------------------- item aggregates ---------------------------
interface ItemRow {
  itemId: string;
  name: string;
  qty: number;
  revenue: number;
  price: number;
}

async function itemAgg(outletId: string): Promise<ItemRow[]> {
  return prisma.$queryRaw<ItemRow[]>`
    SELECT
      COALESCE(oi."itemId"::text, oi."nameSnapshot") AS "itemId",
      oi."nameSnapshot" AS name,
      SUM(oi.qty)::int AS qty,
      SUM(oi.qty * oi."unitPricePaise")::int AS revenue,
      MAX(oi."unitPricePaise")::int AS price
    FROM order_items oi
    JOIN orders o ON o.id = oi."orderId"
    WHERE o."outletId" = ${outletId}::uuid
      AND o."status" <> 'cancelled'
      AND o."placedAt" >= now() - interval '30 days'
    GROUP BY 1, 2
    ORDER BY qty DESC
  `;
}

/**
 * Menu-engineering quadrant: popularity (units sold) × profit.
 * True COGS needs recipe costs (not seeded yet), so until those land we use
 * unit price as the margin proxy on the y-axis — higher ticket ≈ higher
 * absolute contribution. Items split around the median of each axis:
 *   high pop + high profit = Star · high pop + low profit = Plowhorse
 *   low pop + high profit = Puzzle · low pop + low profit = Dog
 */
function toQuadrant(rows: ItemRow[]): MenuDot[] {
  if (rows.length === 0) return [];
  const maxQty = Math.max(...rows.map((r) => r.qty), 1);
  const maxPrice = Math.max(...rows.map((r) => r.price), 1);
  const medQty = median(rows.map((r) => r.qty));
  const medPrice = median(rows.map((r) => r.price));

  return rows.slice(0, 16).map((r) => {
    const hiPop = r.qty >= medQty;
    const hiProfit = r.price >= medPrice;
    const quad: MenuDot['quad'] = hiPop
      ? hiProfit
        ? 'star'
        : 'plowhorse'
      : hiProfit
        ? 'puzzle'
        : 'dog';
    return {
      itemId: r.itemId,
      name: r.name,
      qty: r.qty,
      revenuePaise: r.revenue,
      pop: clamp(Math.round((r.qty / maxQty) * 92) + 4),
      profit: clamp(Math.round((r.price / maxPrice) * 88) + 6),
      quad,
    };
  });
}

// --------------------------- inventory ---------------------------
async function lowStock(outletId: string): Promise<LowStock[]> {
  const items = await prisma.stockItem.findMany({
    where: { outletId },
    orderBy: { qtyOnHand: 'asc' },
  });
  return items
    .filter((s) => Number(s.qtyOnHand) <= Number(s.reorderLevel))
    .slice(0, 6)
    .map((s) => {
      const on = Number(s.qtyOnHand);
      const reorder = Number(s.reorderLevel) || 1;
      return {
        id: s.id,
        name: s.name,
        qty: `${trimNum(on)} ${s.unit}`,
        level: on <= reorder * 0.5 ? ('critical' as const) : ('low' as const),
      };
    });
}

// --------------------------- loyalty ---------------------------
async function loyaltySnapshot(
  outletId: string,
): Promise<Omit<LoyaltySnapshot, 'qrScanPct'>> {
  const outlet = await prisma.outlet.findUnique({
    where: { id: outletId },
    select: { tenantId: true },
  });
  if (!outlet) return { customers: 0, repeatPct: 0, gamesPlayed: 0, pointsLiability: 0 };

  const [customers, repeat, games, points] = await Promise.all([
    prisma.customer.count({ where: { tenantId: outlet.tenantId } }),
    prisma.customer.count({ where: { tenantId: outlet.tenantId, visitCount: { gt: 1 } } }),
    prisma.gameSession.count({ where: { outletId } }),
    prisma.customer.aggregate({
      where: { tenantId: outlet.tenantId },
      _sum: { points: true },
    }),
  ]);

  return {
    customers,
    repeatPct: customers > 0 ? Math.round((repeat / customers) * 100) : 0,
    gamesPlayed: games,
    pointsLiability: points._sum.points ?? 0,
  };
}

async function qrShare(outletId: string): Promise<number> {
  const rows = await prisma.$queryRaw<{ total: number; viaqr: number }[]>`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE "tableId" IS NOT NULL AND "type" = 'dine_in')::int AS viaqr
    FROM orders
    WHERE "outletId" = ${outletId}::uuid
      AND "placedAt" >= now() - interval '7 days'
  `;
  const r = rows[0];
  return r && r.total > 0 ? Math.round((r.viaqr / r.total) * 100) : 0;
}

// --------------------------- AI briefing (derived from data) ---------------------------
function buildBriefing(
  kpi: Kpi,
  trend: TrendPoint[],
  hourly: number[],
  topItems: { name: string; qty: number }[],
  lowStock: LowStock[],
): Brief[] {
  const out: Brief[] = [];

  if (kpi.todayOrders === 0) {
    out.push({
      tone: 'tip',
      text: 'No orders booked yet today. Once the till opens, sales, footfall and live KPIs populate here in real time.',
      action: 'Open the POS',
    });
  } else if (kpi.salesDeltaPct != null && kpi.salesDeltaPct >= 0) {
    out.push({
      tone: 'up',
      text: `Sales are tracking ${kpi.salesDeltaPct}% ahead of yesterday on ${kpi.todayOrders} order${kpi.todayOrders === 1 ? '' : 's'}. Momentum is good — keep upsell prompts on at the till.`,
      action: 'View sales',
    });
  } else if (kpi.salesDeltaPct != null) {
    out.push({
      tone: 'warn',
      text: `Sales are ${Math.abs(kpi.salesDeltaPct)}% behind yesterday. A quick PWA push on a hero item usually recovers the gap.`,
      action: 'Draft a push',
    });
  }

  const peak = hourly.indexOf(Math.max(...hourly));
  if (Math.max(...hourly) > 0) {
    out.push({
      tone: 'tip',
      text: `Your busiest window over the last 7 days is ${fmtHour(peak)}–${fmtHour((peak + 1) % 24)}. Staff and prep should peak just before it.`,
      action: 'Plan rosters',
    });
  }

  if (topItems[0]) {
    out.push({
      tone: 'up',
      text: `${topItems[0].name} is your top mover (${topItems[0].qty} sold this month). Bundle it with a slow line to lift average order value.`,
      action: 'Build a combo',
    });
  }

  if (lowStock.length > 0) {
    const crit = lowStock.filter((s) => s.level === 'critical').length;
    out.push({
      tone: 'warn',
      text: `${lowStock.length} ingredient${lowStock.length === 1 ? '' : 's'} at or below reorder level${crit ? ` (${crit} critical)` : ''}. Raise a purchase order before the next rush.`,
      action: 'Reorder stock',
    });
  }

  return out.slice(0, 4);
}

// --------------------------- helpers ---------------------------
function pctDelta(now: number, prev: number): number | null {
  if (prev === 0) return now > 0 ? 100 : null;
  return Math.round(((now - prev) / prev) * 100);
}
function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = xs.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}
const clamp = (n: number, lo = 4, hi = 96) => Math.max(lo, Math.min(hi, n));
const iso = (d: Date) => d.toISOString().slice(0, 10);
const trimNum = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const fmtHour = (h: number) =>
  h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`;
