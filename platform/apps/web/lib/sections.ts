import { prisma } from '@cafeos/db';
import { readOccupancyConfig, syncOccupancyAlerts, type OccupancyConfig, type LowRevTable } from './occupancy';
import { checkSalesDrop } from './alerts';
import { channelStatus } from './notify';
import { readDevices, type Device } from './devices';
import { readFloors, readTableFloors, type Floor } from './floors';
import { readPwaConfig, type PwaConfig } from './pwa';
import { readGstConfig } from './tax';

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
  | 'monitor'
  | 'sales'
  | 'inventory'
  | 'suppliers'
  | 'tables'
  | 'staff'
  | 'loyalty'
  | 'marketing'
  | 'menu'
  | 'settings'
  | 'pwa';

// ===================== Sales & Analytics =====================
export interface SalesData {
  range: { days: number };
  totals: { grossPaise: number; discountPaise: number; taxPaise: number; orders: number; aovPaise: number };
  daily: { date: string; label: string; orders: number; grossPaise: number; discountPaise: number; taxPaise: number }[];
  payMix: { method: string; amountPaise: number; count: number }[];
  typeMix: { type: string; orders: number; grossPaise: number }[];
  topItems: { name: string; qty: number; revenuePaise: number }[];
  /** GST summary for the window — taxable vs exempt sales + tax by slab */
  gst: {
    taxCollectedPaise: number;   // exact: Σ CGST+SGST+IGST on non-cancelled orders
    taxableSalesPaise: number;   // subtotal of orders that carried tax
    nonTaxableSalesPaise: number; // subtotal of orders that carried no tax
    byRate: { rate: number; revenuePaise: number; estTaxPaise: number }[]; // revenue per item GST slab
  };
}

const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

async function getSales(outletId: string): Promise<SalesData> {
  const [daily, totalsRow, payMix, typeMix, topItems, gstSummary, gstByRate] = await Promise.all([
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
    // GST: taxable vs exempt sales (an order is "taxable" if it carried any GST)
    prisma.$queryRaw<{ taxable: number; nontaxable: number; tax: number }[]>`
      SELECT
        COALESCE(SUM("subtotalPaise") FILTER (WHERE ("cgstPaise" + "sgstPaise" + "igstPaise") > 0), 0)::int AS taxable,
        COALESCE(SUM("subtotalPaise") FILTER (WHERE ("cgstPaise" + "sgstPaise" + "igstPaise") = 0), 0)::int AS nontaxable,
        COALESCE(SUM("cgstPaise" + "sgstPaise" + "igstPaise"), 0)::int AS tax
      FROM orders
      WHERE "outletId" = ${outletId}::uuid
        AND "status" <> 'cancelled'
        AND "placedAt" >= now() - interval '30 days'
    `,
    // GST by slab: revenue grouped by each line item's GST rate (0% = exempt)
    prisma.$queryRaw<{ rate: number; revenue: number }[]>`
      SELECT COALESCE(mi."gstRate", 0)::float AS rate,
             COALESCE(SUM(oi.qty * oi."unitPricePaise"), 0)::int AS revenue
      FROM order_items oi
      JOIN orders o ON o.id = oi."orderId"
      LEFT JOIN menu_items mi ON mi.id = oi."itemId"
      WHERE o."outletId" = ${outletId}::uuid
        AND o."status" <> 'cancelled'
        AND o."placedAt" >= now() - interval '30 days'
      GROUP BY 1
      ORDER BY 1
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
  const g = gstSummary[0] ?? { taxable: 0, nontaxable: 0, tax: 0 };
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
    gst: {
      taxCollectedPaise: g.tax,
      taxableSalesPaise: g.taxable,
      nonTaxableSalesPaise: g.nontaxable,
      // estTax is exclusive-basis (revenue × rate) — a reporting estimate per slab,
      // while taxCollectedPaise above is the exact figure billed.
      byRate: gstByRate.map((r) => ({ rate: r.rate, revenuePaise: r.revenue, estTaxPaise: Math.round((r.revenue * r.rate) / 100) })),
    },
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
  /** recent recipe-driven stock deductions (reason = sale) — Phase A consumption history */
  consumption: { id: string; name: string; unit: string; qty: number; at: string }[];
  /** open low-stock / out-of-stock alerts — Phase A */
  alerts: { id: string; type: string; severity: string; title: string; body: string | null; at: string }[];
  /** recipe mappings grouped by menu item — for the Recipes Wizard */
  recipes: { itemId: string; itemName: string; lines: { id: string; material: string; qty: number; unit: string }[] }[];
}

async function getInventory(outletId: string): Promise<InventoryData> {
  const [stock, waste, consumption, alerts, recipeRows] = await Promise.all([
    prisma.stockItem.findMany({ where: { outletId }, orderBy: { qtyOnHand: 'asc' } }),
    prisma.wasteLog.findMany({
      where: { outletId },
      orderBy: { createdAt: 'desc' },
      take: 12,
      include: { stockItem: { select: { name: true, unit: true } } },
    }),
    prisma.stockLedger.findMany({
      where: { outletId, reason: 'sale' },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { stockItem: { select: { name: true, unit: true } } },
    }),
    prisma.notification.findMany({
      where: { outletId, readAt: null, type: { in: ['low_stock', 'out_of_stock'] } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.recipe.findMany({
      where: { item: { outletId } },
      include: { item: { select: { name: true } }, stockItem: { select: { name: true, unit: true } } },
    }),
  ]);

  // group recipe lines by menu item
  const recipeMap = new Map<string, { itemId: string; itemName: string; lines: { id: string; material: string; qty: number; unit: string }[] }>();
  for (const r of recipeRows) {
    const g = recipeMap.get(r.itemId) ?? { itemId: r.itemId, itemName: r.item.name, lines: [] };
    g.lines.push({ id: r.id, material: r.stockItem.name, qty: Number(r.qty), unit: r.unit ?? r.stockItem.unit });
    recipeMap.set(r.itemId, g);
  }

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
    consumption: consumption.map((c) => ({
      id: c.id,
      name: c.stockItem.name,
      unit: c.stockItem.unit,
      qty: Math.abs(Number(c.change)),
      at: c.createdAt.toISOString(),
    })),
    alerts: alerts.map((a) => ({
      id: a.id,
      type: a.type,
      severity: a.severity,
      title: a.title,
      body: a.body,
      at: a.createdAt.toISOString(),
    })),
    recipes: [...recipeMap.values()].sort((a, b) => a.itemName.localeCompare(b.itemName)),
  };
}

// ===================== Suppliers & Credit (Phase B) =====================
export interface SuppliersData {
  summary: { vendors: number; outstandingPaise: number; paid30Paise: number; overdueCount: number; overduePaise: number };
  vendors: {
    id: string;
    name: string;
    phone: string | null;
    openingBalancePaise: number;
    invoicedPaise: number;
    paidPaise: number;
    balancePaise: number;
    lastPaymentAt: string | null;
  }[];
  invoices: {
    id: string;
    vendorName: string;
    invoiceNo: string | null;
    totalPaise: number;
    paidPaise: number;
    balancePaise: number;
    payStatus: 'paid' | 'partial' | 'unpaid';
    dueDate: string | null;
    overdue: boolean;
    at: string;
  }[];
  payments: { id: string; vendorName: string; amountPaise: number; method: string; reference: string | null; at: string }[];
}

async function getSuppliers(outletId: string, tenantId: string): Promise<SuppliersData> {
  const [vendors, poByVendor, payByVendor, recentInvoices, recentPayments, paid30] = await Promise.all([
    prisma.vendor.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, phone: true, openingBalancePaise: true },
    }),
    prisma.purchaseOrder.groupBy({
      by: ['vendorId'],
      where: { outletId, status: { not: 'cancelled' } },
      _sum: { totalPaise: true, paidPaise: true },
    }),
    prisma.supplierPayment.groupBy({
      by: ['vendorId'],
      where: { outletId },
      _sum: { amountPaise: true },
      _max: { paidAt: true },
    }),
    prisma.purchaseOrder.findMany({
      where: { outletId, status: { not: 'cancelled' } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { vendor: { select: { name: true } } },
    }),
    prisma.supplierPayment.findMany({
      where: { outletId },
      orderBy: { paidAt: 'desc' },
      take: 20,
      include: { vendor: { select: { name: true } } },
    }),
    prisma.supplierPayment.aggregate({
      where: { outletId, paidAt: { gte: new Date(Date.now() - 30 * 86400_000) } },
      _sum: { amountPaise: true },
    }),
  ]);

  const poMap = new Map(poByVendor.map((r) => [r.vendorId, r._sum]));
  const payMap = new Map(payByVendor.map((r) => [r.vendorId, r]));

  let outstanding = 0;
  const vendorRows = vendors.map((v) => {
    const invoiced = poMap.get(v.id)?.totalPaise ?? 0;
    const paid = payMap.get(v.id)?._sum.amountPaise ?? 0;
    const balance = v.openingBalancePaise + invoiced - paid;
    if (balance > 0) outstanding += balance;
    return {
      id: v.id,
      name: v.name,
      phone: v.phone,
      openingBalancePaise: v.openingBalancePaise,
      invoicedPaise: invoiced,
      paidPaise: paid,
      balancePaise: balance,
      lastPaymentAt: payMap.get(v.id)?._max.paidAt?.toISOString() ?? null,
    };
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let overdueCount = 0;
  let overduePaise = 0;

  const invoices = recentInvoices.map((p) => {
    const balance = p.totalPaise - p.paidPaise;
    const payStatus: 'paid' | 'partial' | 'unpaid' = balance <= 0 ? 'paid' : p.paidPaise > 0 ? 'partial' : 'unpaid';
    const overdue = !!p.dueDate && balance > 0 && p.dueDate < today;
    if (overdue) {
      overdueCount++;
      overduePaise += balance;
    }
    return {
      id: p.id,
      vendorName: p.vendor.name,
      invoiceNo: p.invoiceNo,
      totalPaise: p.totalPaise,
      paidPaise: p.paidPaise,
      balancePaise: balance,
      payStatus,
      dueDate: p.dueDate ? p.dueDate.toISOString().slice(0, 10) : null,
      overdue,
      at: p.createdAt.toISOString(),
    };
  });

  return {
    summary: {
      vendors: vendors.length,
      outstandingPaise: outstanding,
      paid30Paise: paid30._sum.amountPaise ?? 0,
      overdueCount,
      overduePaise,
    },
    vendors: vendorRows,
    invoices,
    payments: recentPayments.map((p) => ({
      id: p.id,
      vendorName: p.vendor.name,
      amountPaise: p.amountPaise,
      method: p.method,
      reference: p.reference,
      at: p.paidAt.toISOString(),
    })),
  };
}

// ===================== Owner Monitor: live ops (Phase E) =====================
export interface MonitorData {
  today: { salesPaise: number; orders: number; cashPaise: number; upiPaise: number; otherPaise: number };
  ordersInProgress: { pendingApproval: number; inKitchen: number; ready: number };
  inventory: { items: number; low: number; critical: number };
  tables: { total: number; occupied: number; lowRevenue: number };
  staffOnDuty: number;
  supplierOutstandingPaise: number;
  salesTrend: { todayPaise: number; avg7Paise: number; deltaPct: number };
  channels: { inApp: boolean; push: boolean; whatsapp: boolean; email: boolean };
  alerts: { id: string; type: string; severity: string; title: string; body: string | null; at: string }[];
  alertCount: number;
}

async function getMonitor(outletId: string, tenantId: string): Promise<MonitorData> {
  const [today, payToday, prog, stock, occ, tableCount, staffOnDuty, poAgg, payAgg, vendAgg, avg7Row, alerts, alertCount] = await Promise.all([
    prisma.$queryRaw<{ orders: number; sales: number }[]>`
      SELECT COUNT(*)::int AS orders, COALESCE(SUM("totalPaise"),0)::int AS sales
      FROM orders WHERE "outletId" = ${outletId}::uuid AND status <> 'cancelled'
        AND ("placedAt" AT TIME ZONE ${TZ})::date = (now() AT TIME ZONE ${TZ})::date`,
    prisma.$queryRaw<{ method: string; amount: number }[]>`
      SELECT method::text AS method, COALESCE(SUM("amountPaise"),0)::int AS amount
      FROM payments WHERE "outletId" = ${outletId}::uuid AND status = 'success'
        AND ("createdAt" AT TIME ZONE ${TZ})::date = (now() AT TIME ZONE ${TZ})::date
      GROUP BY 1`,
    prisma.order.groupBy({ by: ['status'], where: { outletId, status: { in: ['pending_approval', 'in_kitchen', 'ready'] } }, _count: true }),
    prisma.stockItem.findMany({ where: { outletId }, select: { qtyOnHand: true, reorderLevel: true } }),
    prisma.$queryRaw<{ id: string; label: string; since: Date; bill: number }[]>`
      SELECT t.id::text AS id, t.label AS label, MIN(o."placedAt") AS since, COALESCE(SUM(o."totalPaise"),0)::int AS bill
      FROM tables_map t JOIN orders o ON o."tableId" = t.id AND o."type"='dine_in' AND o.status IN ('open','in_kitchen','ready','served')
      WHERE t."outletId" = ${outletId}::uuid GROUP BY t.id, t.label`,
    prisma.tableMap.count({ where: { outletId } }),
    prisma.attendance.count({ where: { outletId, clockOut: null } }),
    prisma.purchaseOrder.aggregate({ where: { outletId, status: { not: 'cancelled' } }, _sum: { totalPaise: true } }),
    prisma.supplierPayment.aggregate({ where: { outletId }, _sum: { amountPaise: true } }),
    prisma.vendor.aggregate({ where: { tenantId }, _sum: { openingBalancePaise: true } }),
    prisma.$queryRaw<{ avg: number }[]>`
      SELECT COALESCE(AVG(d.sales),0)::float AS avg FROM (
        SELECT ("placedAt" AT TIME ZONE ${TZ})::date AS day, SUM("totalPaise")::int AS sales
        FROM orders WHERE "outletId" = ${outletId}::uuid AND status <> 'cancelled'
          AND ("placedAt" AT TIME ZONE ${TZ})::date >= (now() AT TIME ZONE ${TZ})::date - 7
          AND ("placedAt" AT TIME ZONE ${TZ})::date < (now() AT TIME ZONE ${TZ})::date
        GROUP BY 1
      ) d`,
    prisma.notification.findMany({ where: { outletId, readAt: null }, orderBy: { createdAt: 'desc' }, take: 12 }),
    prisma.notification.count({ where: { outletId, readAt: null } }),
  ]);

  const occCfg = readOccupancyConfig((await prisma.outlet.findUnique({ where: { id: outletId }, select: { settings: true } }))?.settings);
  const nowMs = Date.now();
  const low: LowRevTable[] = occ
    .map((r) => ({ id: r.id, label: r.label, durationMin: Math.round((nowMs - new Date(r.since).getTime()) / 60000), billPaise: r.bill }))
    .filter((t) => t.durationMin >= occCfg.minutes && t.billPaise < occCfg.minBillPaise);

  let lowCnt = 0, critCnt = 0;
  for (const s of stock) {
    const on = Number(s.qtyOnHand), re = Number(s.reorderLevel);
    if (re > 0 && on <= re) { if (on <= re * 0.5) critCnt++; else lowCnt++; }
  }

  const payMap = new Map(payToday.map((p) => [p.method, p.amount]));
  const cash = payMap.get('cash') ?? 0;
  const upi = payMap.get('upi') ?? 0;
  const otherPay = [...payMap.entries()].filter(([m]) => m !== 'cash' && m !== 'upi').reduce((s, [, a]) => s + a, 0);
  const progMap = new Map(prog.map((p) => [p.status, p._count]));

  const todaySales = today[0]?.sales ?? 0;
  const avg7 = Math.round(avg7Row[0]?.avg ?? 0);
  await checkSalesDrop(outletId, todaySales, avg7);

  const outstanding = (vendAgg._sum.openingBalancePaise ?? 0) + (poAgg._sum.totalPaise ?? 0) - (payAgg._sum.amountPaise ?? 0);

  return {
    today: { salesPaise: todaySales, orders: today[0]?.orders ?? 0, cashPaise: cash, upiPaise: upi, otherPaise: otherPay },
    ordersInProgress: { pendingApproval: progMap.get('pending_approval') ?? 0, inKitchen: progMap.get('in_kitchen') ?? 0, ready: progMap.get('ready') ?? 0 },
    inventory: { items: stock.length, low: lowCnt, critical: critCnt },
    tables: { total: tableCount, occupied: occ.length, lowRevenue: low.length },
    staffOnDuty,
    supplierOutstandingPaise: Math.max(0, outstanding),
    salesTrend: { todayPaise: todaySales, avg7Paise: avg7, deltaPct: avg7 > 0 ? Math.round(((todaySales - avg7) / avg7) * 100) : 0 },
    channels: channelStatus(),
    alerts: alerts.map((a) => ({ id: a.id, type: a.type, severity: a.severity, title: a.title, body: a.body, at: a.createdAt.toISOString() })),
    alertCount,
  };
}

// ===================== Tables: occupancy & revenue (Phase D) =====================
export interface TablesData {
  config: OccupancyConfig;
  totals: {
    tables: number;
    occupied: number;
    lowRevenueCount: number;
    avgStayMin: number;
    avgSpendPaise: number;
    revenuePerOccupiedHourPaise: number;
  };
  roster: { id: string; label: string; seats: number; state: string; floorId: string | null }[];
  floors: { id: string; name: string; sort: number }[];
  occupancy: { id: string; label: string; sinceMs: number; durationMin: number; billPaise: number; orders: number; lowRevenue: boolean }[];
  profitability: { id: string; label: string; orders: number; revenuePaise: number; avgStayMin: number }[];
  peakHours: { hour: number; orders: number; revenuePaise: number }[];
  heatmap: { dow: number; hour: number; revenuePaise: number }[];
}

async function getTables(outletId: string): Promise<TablesData> {
  const outlet = await prisma.outlet.findUnique({ where: { id: outletId }, select: { settings: true } });
  const config = readOccupancyConfig(outlet?.settings);
  // floors + table→floor assignment live in Outlet.settings (no schema change)
  const floors = readFloors(outlet?.settings);
  const tableFloors = readTableFloors(outlet?.settings);

  const [roster, occupiedRows, profitRows, visitRows, heatRows] = await Promise.all([
    prisma.tableMap.findMany({ where: { outletId }, orderBy: { label: 'asc' }, select: { id: true, label: true, seats: true, state: true } }),
    // live occupancy: active (unsettled) dine-in orders define an occupied table
    prisma.$queryRaw<{ id: string; label: string; since: Date; bill: number; orders: number }[]>`
      SELECT t.id::text AS id, t.label AS label,
             MIN(o."placedAt") AS since,
             COALESCE(SUM(o."totalPaise"), 0)::int AS bill,
             COUNT(*)::int AS orders
      FROM tables_map t
      JOIN orders o ON o."tableId" = t.id
        AND o."type" = 'dine_in'
        AND o."status" IN ('open', 'in_kitchen', 'ready', 'served')
      WHERE t."outletId" = ${outletId}::uuid
      GROUP BY t.id, t.label
    `,
    // revenue per table over 30 days (settled / non-cancelled)
    prisma.$queryRaw<{ id: string; label: string; orders: number; revenue: number; stay: number }[]>`
      SELECT t.id::text AS id, t.label AS label,
             COUNT(o.*)::int AS orders,
             COALESCE(SUM(o."totalPaise"), 0)::int AS revenue,
             COALESCE(AVG(EXTRACT(EPOCH FROM (COALESCE(o."settledAt", o."placedAt") - o."placedAt"))), 0)::float AS stay
      FROM tables_map t
      LEFT JOIN orders o ON o."tableId" = t.id
        AND o."status" <> 'cancelled'
        AND o."placedAt" >= now() - interval '30 days'
      WHERE t."outletId" = ${outletId}::uuid
      GROUP BY t.id, t.label
      ORDER BY revenue DESC
    `,
    // "visit" = table × day, for honest avg stay + avg spend
    prisma.$queryRaw<{ stay_secs: number; revenue: number }[]>`
      SELECT EXTRACT(EPOCH FROM (MAX(COALESCE(o."settledAt", o."placedAt")) - MIN(o."placedAt")))::float AS stay_secs,
             SUM(o."totalPaise")::int AS revenue
      FROM orders o
      WHERE o."outletId" = ${outletId}::uuid
        AND o."status" = 'settled'
        AND o."tableId" IS NOT NULL
        AND o."placedAt" >= now() - interval '30 days'
      GROUP BY o."tableId", ("placedAt" AT TIME ZONE ${TZ})::date
    `,
    // revenue heatmap by day-of-week × hour
    prisma.$queryRaw<{ dow: number; hour: number; orders: number; revenue: number }[]>`
      SELECT EXTRACT(DOW FROM (o."placedAt" AT TIME ZONE ${TZ}))::int AS dow,
             EXTRACT(HOUR FROM (o."placedAt" AT TIME ZONE ${TZ}))::int AS hour,
             COUNT(*)::int AS orders,
             COALESCE(SUM(o."totalPaise"), 0)::int AS revenue
      FROM orders o
      WHERE o."outletId" = ${outletId}::uuid
        AND o."status" <> 'cancelled'
        AND o."placedAt" >= now() - interval '30 days'
      GROUP BY 1, 2
    `,
  ]);

  const nowMs = Date.now();
  const occupancy = occupiedRows.map((r) => {
    const sinceMs = new Date(r.since).getTime();
    const durationMin = Math.max(0, Math.round((nowMs - sinceMs) / 60000));
    const lowRevenue = durationMin >= config.minutes && r.bill < config.minBillPaise;
    return { id: r.id, label: r.label, sinceMs, durationMin, billPaise: r.bill, orders: r.orders, lowRevenue };
  }).sort((a, b) => b.durationMin - a.durationMin);

  const low: LowRevTable[] = occupancy.filter((o) => o.lowRevenue).map((o) => ({ id: o.id, label: o.label, durationMin: o.durationMin, billPaise: o.billPaise }));
  await syncOccupancyAlerts(outletId, low);

  const totalStaySecs = visitRows.reduce((s, v) => s + (v.stay_secs || 0), 0);
  const totalVisitRev = visitRows.reduce((s, v) => s + (v.revenue || 0), 0);
  const visits = visitRows.length;
  const avgStayMin = visits ? Math.round(totalStaySecs / visits / 60) : 0;
  const avgSpendPaise = visits ? Math.round(totalVisitRev / visits) : 0;
  const totalStayHours = totalStaySecs / 3600;
  const revenuePerOccupiedHourPaise = totalStayHours > 0 ? Math.round(totalVisitRev / totalStayHours) : 0;

  const byHour = new Map<number, { orders: number; revenue: number }>();
  for (const h of heatRows) {
    const cur = byHour.get(h.hour) ?? { orders: 0, revenue: 0 };
    cur.orders += h.orders; cur.revenue += h.revenue;
    byHour.set(h.hour, cur);
  }
  const peakHours = [...byHour.entries()]
    .map(([hour, v]) => ({ hour, orders: v.orders, revenuePaise: v.revenue }))
    .sort((a, b) => a.hour - b.hour);

  return {
    config,
    totals: {
      tables: roster.length,
      occupied: occupancy.length,
      lowRevenueCount: low.length,
      avgStayMin,
      avgSpendPaise,
      revenuePerOccupiedHourPaise,
    },
    roster: roster.map((t) => ({ id: t.id, label: t.label, seats: t.seats, state: t.state, floorId: tableFloors[t.id] ?? null })),
    floors: floors.map((f) => ({ id: f.id, name: f.name, sort: f.sort })),
    occupancy,
    profitability: profitRows.map((r) => ({ id: r.id, label: r.label, orders: r.orders, revenuePaise: r.revenue, avgStayMin: Math.round((r.stay || 0) / 60) })),
    peakHours,
    heatmap: heatRows.map((h) => ({ dow: h.dow, hour: h.hour, revenuePaise: h.revenue })),
  };
}

// ===================== Staff =====================
export interface StaffMember {
  id: string; name: string; role: string; phone: string | null; active: boolean;
  employeeCode: string | null; payType: string | null; payRatePaise: number | null; hasPin: boolean;
}
export interface StaffActivity {
  staffId: string; name: string; role: string;
  status: 'occupied' | 'free';
  activeTables: string[]; activeOrders: number;
  today: { orders: number; approvals: number; settled: number; voided: number; grossPaise: number };
}
export interface StaffData {
  members: StaffMember[];
  sales: { staffId: string | null; name: string; orders: number; grossPaise: number }[];
  attendance: { id: string; name: string; clockIn: string; clockOut: string | null }[];
  // ---- Staff/HR module (Phase F) ----
  activity: StaffActivity[];
  attendanceToday: { staffId: string; name: string; clockIn: string | null; clockOut: string | null; minutes: number; present: boolean }[];
  shifts: { id: string; staffId: string; name: string; startsAt: string; endsAt: string; role: string | null }[];
  payroll: { staffId: string; name: string; payType: string | null; payRatePaise: number | null; paidThisPeriodPaise: number; recent: { id: string; periodLabel: string; amountPaise: number; method: string; paidAt: string }[] }[];
  period: string; // current payroll period "YYYY-MM"
}

async function getStaff(outletId: string, tenantId: string): Promise<StaffData> {
  const period = new Date().toISOString().slice(0, 7);
  const [memberRows, sales, attendance, active, todayWork, attToday, shiftRows, payRows] = await Promise.all([
    prisma.staffUser.findMany({
      where: { tenantId, OR: [{ outletId }, { outletId: null }] },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true, role: true, phone: true, active: true, employeeCode: true, payType: true, payRatePaise: true, pinHash: true },
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
    // active (unsettled) dine-in orders attributed to a staff member (taker or approver)
    prisma.$queryRaw<{ staffId: string; tables: string[]; orders: number }[]>`
      SELECT s.id::text AS "staffId",
             COALESCE(array_agg(DISTINCT t.label) FILTER (WHERE t.label IS NOT NULL), '{}') AS tables,
             COUNT(DISTINCT o.id)::int AS orders
      FROM orders o
      JOIN staff_users s ON s.id = o."staffId" OR s.id = o."approvedById"
      LEFT JOIN tables_map t ON t.id = o."tableId"
      WHERE o."outletId" = ${outletId}::uuid
        AND o."settledAt" IS NULL
        AND o."status" IN ('open','in_kitchen','ready','served')
      GROUP BY s.id
    `,
    // today's work per staff: orders taken + ₹ + approvals/settles/voids from the audit log
    prisma.$queryRaw<{ staffId: string; orders: number; gross: number; approvals: number; settled: number; voided: number }[]>`
      SELECT s.id::text AS "staffId",
             COALESCE(ord.orders, 0)::int AS orders,
             COALESCE(ord.gross, 0)::int AS gross,
             COALESCE(al.approvals, 0)::int AS approvals,
             COALESCE(al.settled, 0)::int AS settled,
             COALESCE(al.voided, 0)::int AS voided
      FROM staff_users s
      LEFT JOIN (
        SELECT "staffId", COUNT(*)::int AS orders, COALESCE(SUM("totalPaise"),0)::int AS gross
        FROM orders
        WHERE "outletId" = ${outletId}::uuid AND status <> 'cancelled'
          AND ("placedAt" AT TIME ZONE ${TZ})::date = (now() AT TIME ZONE ${TZ})::date
        GROUP BY "staffId"
      ) ord ON ord."staffId" = s.id
      LEFT JOIN (
        SELECT "actorId",
               COUNT(*) FILTER (WHERE action = 'order.approved')::int AS approvals,
               COUNT(*) FILTER (WHERE action = 'table.settled')::int AS settled,
               COUNT(*) FILTER (WHERE action = 'order.item_voided')::int AS voided
        FROM audit_log
        WHERE "outletId" = ${outletId}::uuid
          AND ("createdAt" AT TIME ZONE ${TZ})::date = (now() AT TIME ZONE ${TZ})::date
        GROUP BY "actorId"
      ) al ON al."actorId" = s.id
      WHERE s."tenantId" = ${tenantId}::uuid
    `,
    // today's attendance punches
    prisma.$queryRaw<{ staffId: string; name: string; clockIn: Date | null; clockOut: Date | null }[]>`
      SELECT a."staffId"::text AS "staffId", s.name AS name, a."clockIn" AS "clockIn", a."clockOut" AS "clockOut"
      FROM attendance a JOIN staff_users s ON s.id = a."staffId"
      WHERE a."outletId" = ${outletId}::uuid
        AND ("clockIn" AT TIME ZONE ${TZ})::date = (now() AT TIME ZONE ${TZ})::date
      ORDER BY a."clockIn" DESC
    `,
    // today + upcoming shifts
    prisma.shift.findMany({
      where: { outletId, endsAt: { gte: new Date() } },
      orderBy: { startsAt: 'asc' },
      take: 60,
      include: { staff: { select: { name: true } } },
    }),
    // salary payments in the current period
    prisma.salaryPayment.findMany({
      where: { outletId, periodLabel: period },
      orderBy: { paidAt: 'desc' },
      select: { id: true, staffId: true, periodLabel: true, amountPaise: true, method: true, paidAt: true },
    }),
  ]);

  const members: StaffMember[] = memberRows.map(({ pinHash, ...m }) => ({ ...m, hasPin: !!pinHash }));
  const activeBy = new Map(active.map((a) => [a.staffId, a]));
  const workBy = new Map(todayWork.map((w) => [w.staffId, w]));
  const paidBy = new Map<string, number>();
  for (const p of payRows) paidBy.set(p.staffId, (paidBy.get(p.staffId) ?? 0) + p.amountPaise);

  // activity board — only staff who can take/serve orders (exclude kitchen)
  const activity: StaffActivity[] = members
    .filter((m) => m.active && m.role !== 'kitchen')
    .map((m) => {
      const a = activeBy.get(m.id);
      const w = workBy.get(m.id);
      return {
        staffId: m.id, name: m.name, role: m.role,
        status: (a?.orders ?? 0) > 0 ? 'occupied' : 'free',
        activeTables: a?.tables ?? [],
        activeOrders: a?.orders ?? 0,
        today: { orders: w?.orders ?? 0, approvals: w?.approvals ?? 0, settled: w?.settled ?? 0, voided: w?.voided ?? 0, grossPaise: w?.gross ?? 0 },
      };
    });

  const attendanceToday = attToday.map((a) => {
    const end = a.clockOut ? new Date(a.clockOut).getTime() : Date.now();
    const minutes = a.clockIn ? Math.max(0, Math.round((end - new Date(a.clockIn).getTime()) / 60000)) : 0;
    return { staffId: a.staffId, name: a.name, clockIn: a.clockIn ? new Date(a.clockIn).toISOString() : null, clockOut: a.clockOut ? new Date(a.clockOut).toISOString() : null, minutes, present: !!a.clockIn && !a.clockOut };
  });

  const payroll = members.filter((m) => m.active).map((m) => ({
    staffId: m.id, name: m.name, payType: m.payType, payRatePaise: m.payRatePaise,
    paidThisPeriodPaise: paidBy.get(m.id) ?? 0,
    recent: payRows.filter((p) => p.staffId === m.id).map((p) => ({ id: p.id, periodLabel: p.periodLabel, amountPaise: p.amountPaise, method: p.method, paidAt: p.paidAt.toISOString() })),
  }));

  return {
    members,
    sales: sales.map((r) => ({ staffId: r.staffId, name: r.name, orders: r.orders, grossPaise: r.gross })),
    attendance: attendance.map((a) => ({
      id: a.id,
      name: a.staff.name,
      clockIn: a.clockIn.toISOString(),
      clockOut: a.clockOut ? a.clockOut.toISOString() : null,
    })),
    activity,
    attendanceToday,
    shifts: shiftRows.map((s) => ({ id: s.id, staffId: s.staffId, name: s.staff.name, startsAt: s.startsAt.toISOString(), endsAt: s.endsAt.toISOString(), role: s.role })),
    payroll,
    period,
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
    items: { id: string; name: string; pricePaise: number; gstRate: number; station: string | null; isAvailable: boolean; tags: string[]; categoryId: string | null; description: string | null }[];
  }[];
  categoryList: { id: string; name: string }[];
}

async function getMenu(outletId: string): Promise<MenuData> {
  const categories = await prisma.category.findMany({
    where: { outletId },
    orderBy: { sort: 'asc' },
    include: {
      items: {
        orderBy: { name: 'asc' },
        select: { id: true, name: true, pricePaise: true, gstRate: true, station: true, isAvailable: true, tags: true, categoryId: true, description: true },
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
        categoryId: i.categoryId,
        description: i.description,
      };
    }),
  }));

  // flat category list (id + name) for product-management dropdowns
  const categoryList = categories.map((c) => ({ id: c.id, name: c.name }));

  return { counts: { items, available, unavailable: items - available }, categories: out, categoryList };
}

// ===================== Settings =====================
/** A floor table for the Settings → Floor & QR manager. */
export interface FloorTable {
  id: string;
  label: string;
  seats: number;
  state: string;
  qrToken: string;
  /** which floor/area this table belongs to (null = unassigned) */
  floorId: string | null;
  /** active (unsettled) dine-in orders — table is "occupied" while > 0 */
  activeOrders: number;
}

export interface SettingsData {
  outlet: { name: string; address: Record<string, unknown> | null; gstin: string | null; stateCode: string | null; timezone: string; gstEnabled: boolean; gstRate: number | null; gstType: 'inclusive' | 'exclusive' };
  tenant: { name: string; plan: string; gstin: string | null };
  staffCount: number;
  tableCount: number;
  devices: Device[];
  tables: FloorTable[];
  floors: Floor[];
}

async function getSettings(outletId: string, tenantId: string): Promise<SettingsData> {
  const [outlet, tenant, staffCount, tableRows, activeOrders] = await Promise.all([
    prisma.outlet.findUnique({
      where: { id: outletId },
      select: { name: true, address: true, gstin: true, stateCode: true, timezone: true, settings: true },
    }),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, plan: true, gstin: true } }),
    prisma.staffUser.count({ where: { tenantId } }),
    prisma.tableMap.findMany({
      where: { outletId },
      orderBy: { label: 'asc' },
      select: { id: true, label: true, seats: true, state: true, qrToken: true },
    }),
    prisma.order.groupBy({
      by: ['tableId'],
      where: { outletId, type: 'dine_in', settledAt: null, status: { in: ['open', 'in_kitchen', 'ready', 'served'] }, tableId: { not: null } },
      _count: true,
    }),
  ]);

  const activeBy = new Map(activeOrders.map((r) => [r.tableId, r._count]));
  const floors = readFloors(outlet?.settings);
  const tableFloors = readTableFloors(outlet?.settings);
  const floorIds = new Set(floors.map((f) => f.id));
  const tables: FloorTable[] = tableRows.map((t) => {
    const fid = tableFloors[t.id];
    return {
      id: t.id,
      label: t.label,
      seats: t.seats,
      state: t.state,
      qrToken: t.qrToken,
      floorId: fid && floorIds.has(fid) ? fid : null,
      activeOrders: activeBy.get(t.id) ?? 0,
    };
  });

  const gst = readGstConfig(outlet?.settings);
  return {
    outlet: {
      name: outlet?.name ?? '',
      address: (outlet?.address as Record<string, unknown> | null) ?? null,
      gstin: outlet?.gstin ?? null,
      stateCode: outlet?.stateCode ?? null,
      timezone: outlet?.timezone ?? TZ,
      gstEnabled: gst.enabled,
      gstRate: gst.rateOverride,
      gstType: gst.type,
    },
    tenant: { name: tenant?.name ?? '', plan: tenant?.plan ?? 'starter', gstin: tenant?.gstin ?? null },
    staffCount,
    tableCount: tables.length,
    devices: readDevices(outlet?.settings),
    tables,
    floors,
  };
}

// ===================== PWA (customer app config) =====================
export interface PwaSectionData {
  config: PwaConfig;
  /** all menu items, for the Featured Dishes picker */
  menuItems: { id: string; name: string; pricePaise: number; imageUrl: string | null; categoryId: string | null; categoryName: string | null }[];
}

async function getPwa(outletId: string): Promise<PwaSectionData> {
  const [outlet, categories] = await Promise.all([
    prisma.outlet.findUnique({ where: { id: outletId }, select: { settings: true } }),
    prisma.category.findMany({
      where: { outletId },
      orderBy: { sort: 'asc' },
      select: { id: true, name: true, items: { orderBy: { name: 'asc' }, select: { id: true, name: true, pricePaise: true, imageUrl: true, categoryId: true } } },
    }),
  ]);
  const menuItems = categories.flatMap((c) =>
    c.items.map((i) => ({ id: i.id, name: i.name, pricePaise: i.pricePaise, imageUrl: i.imageUrl, categoryId: i.categoryId, categoryName: c.name })),
  );
  return { config: readPwaConfig(outlet?.settings), menuItems };
}

// ===================== dispatcher =====================
export type SectionData =
  | { section: 'monitor'; data: MonitorData }
  | { section: 'sales'; data: SalesData }
  | { section: 'inventory'; data: InventoryData }
  | { section: 'suppliers'; data: SuppliersData }
  | { section: 'tables'; data: TablesData }
  | { section: 'staff'; data: StaffData }
  | { section: 'loyalty'; data: LoyaltyData }
  | { section: 'marketing'; data: MarketingData }
  | { section: 'menu'; data: MenuData }
  | { section: 'settings'; data: SettingsData }
  | { section: 'pwa'; data: PwaSectionData };

export async function getSectionData(
  section: SectionName,
  outletId: string,
  tenantId: string,
): Promise<SectionData> {
  switch (section) {
    case 'monitor':
      return { section, data: await getMonitor(outletId, tenantId) };
    case 'sales':
      return { section, data: await getSales(outletId) };
    case 'inventory':
      return { section, data: await getInventory(outletId) };
    case 'suppliers':
      return { section, data: await getSuppliers(outletId, tenantId) };
    case 'tables':
      return { section, data: await getTables(outletId) };
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
    case 'pwa':
      return { section, data: await getPwa(outletId) };
  }
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
