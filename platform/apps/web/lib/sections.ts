import { prisma } from '@cafeos/db';

/**
 * Cafe OS — Owner Dashboard section data.
 *
 * The Overview tile data lives in `analytics.ts`. This module backs the deeper
 * sidebar sections (Sales, Inventory, Staff, Loyalty, Marketing, Menu, Settings).
 * It is lazily loaded by the client when a section is opened, via
 * `GET /api/dashboard/section?s=…`, so the first paint stays fast.
 *
 * Everything is computed from the REAL Postgres data — an outlet with no orders,
 * stock or customers yet shows honest zeros and empty states, never mock numbers.
 * Money is integer paise (see @cafeos/core). Raw aggregates cast to ::int so
 * Prisma returns plain JSON-safe numbers, and Decimal columns are Number()-coerced.
 */
const TZ = 'Asia/Kolkata';

export type SectionName =
  | 'sales'
  | 'inventory'
  | 'staff'
  | 'loyalty'
  | 'marketing'
  | 'menu'
  | 'settings';

// ===================== Sales & Analytics =====================
export interface SalesData {
  range: { days: number };
  totals: { grossPaise: number; discountPaise: number; taxPaise: number; orders: number; aovPaise: number };
  daily: { date: string; label: string; orders: number; grossPaise: number; discountPaise: number; taxPaise: number }[];
  payMix: { method: string; amountPaise: number; count: number }[];
  typeMix: { type: string; orders: number; grossPaise: number }[];
  topItems: { name: string; qty: number; revenuePaise: number }[];
}

const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

async function getSales(outletId: string): Promise<SalesData> {
  const [daily, totalsRow, payMix, typeMix, topItems] = await Promise.all([
    prisma.$queryRaw<
      { day: Date; orders: number; gross: number; discount: number; tax: number }[]
    >`
      SELECT
        ("placedAt" AT TIME ZONE ${TZ})::date AS day,
        COUNT(*)::int AS orders,
        COALESCE(SUM("totalPaise"), 0)::int AS gross,
        COALESCE(SUM("discountPaise"), 0)::int AS discount,
        COALESCE(SUM("cgstPaise" + "sgstPaise" + "igstPaise"), 0)::int AS tax
      FROM orders
      WHERE "outletId" = ${outletId}::uuid
        AND "status" <> 'cancelled'
        AND ("placedAt" AT TIME ZONE ${TZ})::date > (now() AT TIME ZONE ${TZ})::date - 14
      GROUP BY 1
    `,
    prisma.$queryRaw<{ orders: number; gross: number; discount: number; tax: number }[]>`
      SELECT
        COUNT(*)::int AS orders,
        COALESCE(SUM("totalPaise"), 0)::int AS gross,
        COALESCE(SUM("discountPaise"), 0)::int AS discount,
        COALESCE(SUM("cgstPaise" + "sgstPaise" + "igstPaise"), 0)::int AS tax
      FROM orders
      WHERE "outletId" = ${outletId}::uuid
        AND "status" <> 'cancelled'
        AND "placedAt" >= now() - interval '30 days'
    `,
    prisma.$queryRaw<{ method: string; amount: number; count: number }[]>`
      SELECT p."method"::text AS method,
             COALESCE(SUM(p."amountPaise"), 0)::int AS amount,
             COUNT(*)::int AS count
      FROM payments p
      WHERE p."outletId" = ${outletId}::uuid
        AND p."status" = 'success'
        AND p."createdAt" >= now() - interval '30 days'
      GROUP BY 1
      ORDER BY 2 DESC
    `,
    prisma.$queryRaw<{ type: string; orders: number; gross: number }[]>`
      SELECT "type"::text AS type,
             COUNT(*)::int AS orders,
             COALESCE(SUM("totalPaise"), 0)::int AS gross
      FROM orders
      WHERE "outletId" = ${outletId}::uuid
        AND "status" <> 'cancelled'
        AND "placedAt" >= now() - interval '30 days'
      GROUP BY 1
      ORDER BY 2 DESC
    `,
    prisma.$queryRaw<{ name: string; qty: number; revenue: number }[]>`
      SELECT oi."nameSnapshot" AS name,
             SUM(oi.qty)::int AS qty,
             SUM(oi.qty * oi."unitPricePaise")::int AS revenue
      FROM order_items oi
      JOIN orders o ON o.id = oi."orderId"
      WHERE o."outletId" = ${outletId}::uuid
        AND o."status" <> 'cancelled'
        AND o."placedAt" >= now() - interval '30 days'
      GROUP BY 1
      ORDER BY revenue DESC
      LIMIT 10
    `,
  ]);

  const byDay = new Map(daily.map((r) => [iso(r.day), r]));
  const series: SalesData['daily'] = [];
  const base = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    const key = iso(d);
    const hit = byDay.get(key);
    series.push({
      date: key,
      label: DOW[d.getDay()]!,
      orders: hit?.orders ?? 0,
      grossPaise: hit?.gross ?? 0,
      discountPaise: hit?.discount ?? 0,
      taxPaise: hit?.tax ?? 0,
    });
  }

  const t = totalsRow[0] ?? { orders: 0, gross: 0, discount: 0, tax: 0 };
  return {
    range: { days: 30 },
    totals: {
      grossPaise: t.gross,
      discountPaise: t.discount,
      taxPaise: t.tax,
      orders: t.orders,
      aovPaise: t.orders > 0 ? Math.round(t.gross / t.orders) : 0,
    },
    daily: series,
    payMix: payMix.map((p) => ({ method: p.method, amountPaise: p.amount, count: p.count })),
    typeMix: typeMix.map((p) => ({ type: p.type, orders: p.orders, grossPaise: p.gross })),
    topItems: topItems.map((p) => ({ name: p.name, qty: p.qty, revenuePaise: p.revenue })),
  };
}

// ===================== Inventory =====================
export interface InventoryData {
  totalValuePaise: number;
  counts: { items: number; low: number; critical: number };
  items: {
    id: string;
    name: string;
    unit: string;
    onHand: number;
    reorder: number;
    valuePaise: number;
    status: 'critical' | 'low' | 'ok';
  }[];
  waste: { id: string; name: string; qty: number; unit: string; reason: string; costPaise: number; at: string }[];
}

async function getInventory(outletId: string): Promise<InventoryData> {
  const [stock, waste] = await Promise.all([
    prisma.stockItem.findMany({ where: { outletId }, orderBy: { qtyOnHand: 'asc' } }),
    prisma.wasteLog.findMany({
      where: { outletId },
      orderBy: { createdAt: 'desc' },
      take: 12,
      include: { stockItem: { select: { name: true, unit: true } } },
    }),
  ]);

  let totalValue = 0;
  let low = 0;
  let critical = 0;
  const items = stock.map((s) => {
    const on = Number(s.qtyOnHand);
    const reorder = Number(s.reorderLevel);
    const valuePaise = Math.round(on * s.avgCostPaise);
    totalValue += valuePaise;
    let status: 'critical' | 'low' | 'ok' = 'ok';
    if (on <= reorder) {
      if (on <= (reorder || 1) * 0.5) {
        status = 'critical';
        critical++;
      } else {
        status = 'low';
        low++;
      }
    }
    return { id: s.id, name: s.name, unit: s.unit, onHand: on, reorder, valuePaise, status };
  });

  return {
    totalValuePaise: totalValue,
    counts: { items: stock.length, low, critical },
    items,
    waste: waste.map((w) => ({
      id: w.id,
      name: w.stockItem.name,
      qty: Number(w.qty),
      unit: w.stockItem.unit,
      reason: w.reason,
      costPaise: w.costPaise,
      at: w.createdAt.toISOString(),
    })),
  };
}

// ===================== Staff =====================
export interface StaffData {
  members: { id: string; name: string; role: string; phone: string | null; active: boolean }[];
  sales: { staffId: string | null; name: string; orders: number; grossPaise: number }[];
  attendance: { id: string; name: string; clockIn: string; clockOut: string | null }[];
}

async function getStaff(outletId: string, tenantId: string): Promise<StaffData> {
  const [members, sales, attendance] = await Promise.all([
    prisma.staffUser.findMany({
      where: { tenantId, OR: [{ outletId }, { outletId: null }] },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true, role: true, phone: true, active: true },
    }),
    prisma.$queryRaw<{ staffId: string | null; name: string; orders: number; gross: number }[]>`
      SELECT o."staffId"::text AS "staffId",
             COALESCE(s."name", 'Unattributed') AS name,
             COUNT(*)::int AS orders,
             COALESCE(SUM(o."totalPaise"), 0)::int AS gross
      FROM orders o
      LEFT JOIN staff_users s ON s.id = o."staffId"
      WHERE o."outletId" = ${outletId}::uuid
        AND o."status" <> 'cancelled'
        AND o."placedAt" >= now() - interval '30 days'
      GROUP BY 1, 2
      ORDER BY gross DESC
    `,
    prisma.attendance.findMany({
      where: { outletId },
      orderBy: { clockIn: 'desc' },
      take: 12,
      include: { staff: { select: { name: true } } },
    }),
  ]);

  return {
    members,
    sales: sales.map((r) => ({ staffId: r.staffId, name: r.name, orders: r.orders, grossPaise: r.gross })),
    attendance: attendance.map((a) => ({
      id: a.id,
      name: a.staff.name,
      clockIn: a.clockIn.toISOString(),
      clockOut: a.clockOut ? a.clockOut.toISOString() : null,
    })),
  };
}

// ===================== Loyalty & Games =====================
export interface LoyaltyData {
  totals: { customers: number; pointsLiability: number; coins: number; couponsIssued: number; couponsRedeemed: number };
  tiers: { tier: string; count: number }[];
  topCustomers: { id: string; name: string; tier: string; points: number; visits: number; spendPaise: number }[];
  games: { id: string; name: string; key: string; active: boolean; plays: number }[];
  rewards: { id: string; name: string; type: string; costPoints: number; active: boolean }[];
}

async function getLoyalty(outletId: string, tenantId: string): Promise<LoyaltyData> {
  const [agg, tierRows, topCustomers, games, gamePlays, rewards, couponRows] = await Promise.all([
    prisma.customer.aggregate({
      where: { tenantId },
      _count: true,
      _sum: { points: true, coins: true },
    }),
    prisma.customer.groupBy({ by: ['tier'], where: { tenantId }, _count: true }),
    prisma.customer.findMany({
      where: { tenantId },
      orderBy: [{ lifetimeSpendPaise: 'desc' }, { points: 'desc' }],
      take: 8,
      select: { id: true, name: true, tier: true, points: true, visitCount: true, lifetimeSpendPaise: true },
    }),
    prisma.game.findMany({ where: { tenantId }, select: { id: true, name: true, key: true, active: true } }),
    prisma.gameSession.groupBy({ by: ['gameId'], where: { outletId }, _count: true }),
    prisma.rewardCatalog.findMany({
      where: { tenantId },
      orderBy: { costPoints: 'asc' },
      select: { id: true, name: true, type: true, costPoints: true, active: true },
    }),
    prisma.coupon.groupBy({ by: ['status'], where: { tenantId }, _count: true }),
  ]);

  const playsByGame = new Map(gamePlays.map((g) => [g.gameId, g._count]));
  const couponBy = new Map(couponRows.map((c) => [c.status, c._count]));

  return {
    totals: {
      customers: agg._count,
      pointsLiability: agg._sum.points ?? 0,
      coins: agg._sum.coins ?? 0,
      couponsIssued: couponBy.get('issued') ?? 0,
      couponsRedeemed: couponBy.get('redeemed') ?? 0,
    },
    tiers: tierRows.map((t) => ({ tier: t.tier, count: t._count })),
    topCustomers: topCustomers.map((c) => ({
      id: c.id,
      name: c.name ?? 'Guest',
      tier: c.tier,
      points: c.points,
      visits: c.visitCount,
      spendPaise: c.lifetimeSpendPaise,
    })),
    games: games.map((g) => ({ ...g, plays: playsByGame.get(g.id) ?? 0 })),
    rewards,
  };
}

// ===================== Marketing =====================
export interface MarketingData {
  segments: { id: string; name: string }[];
  campaigns: { id: string; channel: string; status: string | null; scheduledAt: string | null; sent: number; opened: number; clicked: number }[];
  rewards: { id: string; name: string; type: string; costPoints: number; active: boolean }[];
}

async function getMarketing(tenantId: string): Promise<MarketingData> {
  const [segments, campaigns, rewards] = await Promise.all([
    prisma.segment.findMany({ where: { tenantId }, select: { id: true, name: true } }),
    prisma.campaign.findMany({
      where: { tenantId },
      orderBy: { scheduledAt: 'desc' },
      include: { sends: { select: { sentAt: true, openedAt: true, clickedAt: true } } },
    }),
    prisma.rewardCatalog.findMany({
      where: { tenantId },
      orderBy: { costPoints: 'asc' },
      select: { id: true, name: true, type: true, costPoints: true, active: true },
    }),
  ]);

  return {
    segments,
    campaigns: campaigns.map((c) => ({
      id: c.id,
      channel: c.channel,
      status: c.status,
      scheduledAt: c.scheduledAt ? c.scheduledAt.toISOString() : null,
      sent: c.sends.filter((s) => s.sentAt).length,
      opened: c.sends.filter((s) => s.openedAt).length,
      clicked: c.sends.filter((s) => s.clickedAt).length,
    })),
    rewards,
  };
}

// ===================== Menu =====================
export interface MenuData {
  counts: { items: number; available: number; unavailable: number };
  categories: {
    id: string;
    name: string;
    items: { id: string; name: string; pricePaise: number; gstRate: number; station: string | null; isAvailable: boolean; tags: string[] }[];
  }[];
}

async function getMenu(outletId: string): Promise<MenuData> {
  const categories = await prisma.category.findMany({
    where: { outletId },
    orderBy: { sort: 'asc' },
    include: {
      items: {
        orderBy: { name: 'asc' },
        select: { id: true, name: true, pricePaise: true, gstRate: true, station: true, isAvailable: true, tags: true },
      },
    },
  });

  let items = 0;
  let available = 0;
  const out = categories.map((c) => ({
    id: c.id,
    name: c.name,
    items: c.items.map((i) => {
      items++;
      if (i.isAvailable) available++;
      return {
        id: i.id,
        name: i.name,
        pricePaise: i.pricePaise,
        gstRate: Number(i.gstRate),
        station: i.station,
        isAvailable: i.isAvailable,
        tags: i.tags,
      };
    }),
  }));

  return { counts: { items, available, unavailable: items - available }, categories: out };
}

// ===================== Settings =====================
export interface SettingsData {
  outlet: { name: string; address: Record<string, unknown> | null; gstin: string | null; stateCode: string | null; timezone: string };
  tenant: { name: string; plan: string; gstin: string | null };
  staffCount: number;
  tableCount: number;
}

async function getSettings(outletId: string, tenantId: string): Promise<SettingsData> {
  const [outlet, tenant, staffCount, tableCount] = await Promise.all([
    prisma.outlet.findUnique({
      where: { id: outletId },
      select: { name: true, address: true, gstin: true, stateCode: true, timezone: true },
    }),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, plan: true, gstin: true } }),
    prisma.staffUser.count({ where: { tenantId } }),
    prisma.tableMap.count({ where: { outletId } }),
  ]);

  return {
    outlet: {
      name: outlet?.name ?? '',
      address: (outlet?.address as Record<string, unknown> | null) ?? null,
      gstin: outlet?.gstin ?? null,
      stateCode: outlet?.stateCode ?? null,
      timezone: outlet?.timezone ?? TZ,
    },
    tenant: { name: tenant?.name ?? '', plan: tenant?.plan ?? 'starter', gstin: tenant?.gstin ?? null },
    staffCount,
    tableCount,
  };
}

// ===================== dispatcher =====================
export type SectionData =
  | { section: 'sales'; data: SalesData }
  | { section: 'inventory'; data: InventoryData }
  | { section: 'staff'; data: StaffData }
  | { section: 'loyalty'; data: LoyaltyData }
  | { section: 'marketing'; data: MarketingData }
  | { section: 'menu'; data: MenuData }
  | { section: 'settings'; data: SettingsData };

export async function getSectionData(
  section: SectionName,
  outletId: string,
  tenantId: string,
): Promise<SectionData> {
  switch (section) {
    case 'sales':
      return { section, data: await getSales(outletId) };
    case 'inventory':
      return { section, data: await getInventory(outletId) };
    case 'staff':
      return { section, data: await getStaff(outletId, tenantId) };
    case 'loyalty':
      return { section, data: await getLoyalty(outletId, tenantId) };
    case 'marketing':
      return { section, data: await getMarketing(tenantId) };
    case 'menu':
      return { section, data: await getMenu(outletId) };
    case 'settings':
      return { section, data: await getSettings(outletId, tenantId) };
  }
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
