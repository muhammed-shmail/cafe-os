import { NextRequest, NextResponse } from 'next/server';
import { prisma, type Prisma } from '@cafeos/db';
import { computeBill, type BillLine } from '@cafeos/core';
import { getSession } from '@/lib/auth';
import { publish, toTicket } from '@/lib/realtime';
import { reverseRecipeConsumption } from '@/lib/inventory';
import { getOutletGst, gstBillOptions } from '@/lib/tax';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** roles allowed to take payment / settle a table / void a sent item */
const canSettle = (role: string) => ['owner', 'manager', 'cashier'].includes(role);

/** order statuses that count as "running" (occupying the table) */
const ACTIVE_STATUS = ['open', 'in_kitchen', 'ready', 'served'] as const;

/**
 * GET /api/tables/order?tableId=… — the table's running (unsettled) orders,
 * merged into one bill view for the POS table-actions panel. Voided lines are
 * excluded from both the line list and the totals.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const tableId = req.nextUrl.searchParams.get('tableId');
  if (!tableId) return NextResponse.json({ error: 'missing_table' }, { status: 400 });

  const table = await prisma.tableMap.findFirst({ where: { id: tableId, outletId: session.outletId }, select: { id: true, label: true } });
  if (!table) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const orders = await prisma.order.findMany({
    where: { tableId, outletId: session.outletId, status: { in: [...ACTIVE_STATUS] }, settledAt: null },
    orderBy: { placedAt: 'asc' },
    include: { items: { where: { kotStatus: { not: 'void' } } } },
  });

  const lines = orders.flatMap((o) =>
    o.items.map((i) => ({ id: i.id, orderId: o.id, name: i.nameSnapshot, qty: i.qty, station: i.station, linePaise: i.unitPricePaise * i.qty, kotStatus: i.kotStatus })),
  );
  const totals = orders.reduce(
    (t, o) => ({
      subtotalPaise: t.subtotalPaise + o.subtotalPaise,
      taxPaise: t.taxPaise + o.cgstPaise + o.sgstPaise + o.igstPaise,
      totalPaise: t.totalPaise + o.totalPaise,
    }),
    { subtotalPaise: 0, taxPaise: 0, totalPaise: 0 },
  );

  return NextResponse.json({
    table: table.label,
    count: orders.length,
    orders: orders.map((o) => ({ id: o.id, number: o.number, status: o.status })),
    lines,
    totals,
  });
}

/**
 * POST /api/tables/order
 *   { action: 'settle', tableId, method } — settle every running order on the table.
 *   { action: 'void_item', orderId, itemId } — void a single sent line: recompute
 *       the order bill, restore stock, audit, and refresh the KDS. If the order
 *       has no active items left it is cancelled (freeing the table).
 * Cashier/manager/owner only.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!canSettle(session.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { action } = body;

  if (action === 'void_item') return voidItem(session, body);

  // ---- settle ----
  const { tableId, method } = body;
  if (action !== 'settle' || !tableId) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  const pay = (['cash', 'upi', 'card'] as const).includes(method) ? method : 'cash';

  const orders = await prisma.order.findMany({
    where: { tableId, outletId: session.outletId, status: { in: [...ACTIVE_STATUS] }, settledAt: null },
    select: { id: true, totalPaise: true },
  });
  if (orders.length === 0) return NextResponse.json({ error: 'nothing_to_settle' }, { status: 409 });

  let total = 0;
  for (const o of orders) {
    const updated = await prisma.$transaction(async (tx) => {
      await tx.payment.create({
        data: { orderId: o.id, outletId: session.outletId, method: pay, amountPaise: o.totalPaise, status: 'success' },
      });
      return tx.order.update({
        where: { id: o.id },
        data: { status: 'settled', settledAt: new Date() },
        include: { items: true, table: { select: { label: true } } },
      });
    });
    total += o.totalPaise;
    publish(session.outletId, { type: 'order.updated', ticket: toTicket(updated) });
  }

  await prisma.auditLog.create({
    data: { outletId: session.outletId, actorId: session.staffId, action: 'table.settled', entity: 'table', entityId: tableId, after: { method: pay, totalPaise: total, orders: orders.length } as Prisma.InputJsonValue },
  }).catch(() => {});

  return NextResponse.json({ ok: true, settled: orders.length, totalPaise: total, method: pay });
}

/** Void one sent line from an order and recompute everything from the survivors. */
async function voidItem(session: { outletId: string; staffId: string | null }, body: { orderId?: string; itemId?: string }) {
  const { orderId, itemId } = body;
  if (!orderId || !itemId) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });

  const order = await prisma.order.findFirst({
    where: { id: orderId, outletId: session.outletId, status: { in: [...ACTIVE_STATUS] }, settledAt: null },
    include: { items: true },
  });
  if (!order) return NextResponse.json({ error: 'order_not_found' }, { status: 404 });

  const target = order.items.find((i) => i.id === itemId && i.kotStatus !== 'void');
  if (!target) return NextResponse.json({ error: 'item_not_found' }, { status: 404 });

  // survivors = active lines after this void
  const survivors = order.items.filter((i) => i.id !== itemId && i.kotStatus !== 'void');

  // GST rate isn't snapshotted on OrderItem → source it from the menu item
  const itemIds = survivors.map((s) => s.itemId).filter((id): id is string => !!id);
  const gstByItem = new Map<string, number>();
  if (itemIds.length) {
    const menuItems = await prisma.menuItem.findMany({ where: { id: { in: itemIds } }, select: { id: true, gstRate: true } });
    for (const m of menuItems) gstByItem.set(m.id, Number(m.gstRate));
  }

  const billLines: BillLine[] = survivors.map((s) => ({
    pricePaise: s.unitPricePaise,
    modPaise: Array.isArray(s.modifiers) ? (s.modifiers as { pricePaise: number }[]).reduce((sum, m) => sum + (m.pricePaise ?? 0), 0) : 0,
    gstRate: (s.itemId && gstByItem.get(s.itemId)) || 0,
    qty: s.qty,
  }));

  // preserve the order's original discount / service-charge / inter-state shape
  const taxableBase = order.subtotalPaise - order.discountPaise;
  const discountPct = order.subtotalPaise > 0 ? (order.discountPaise / order.subtotalPaise) * 100 : 0;
  const serviceChargePct = taxableBase > 0 ? (order.serviceChargePaise / taxableBase) * 100 : 0;
  const interState = order.igstPaise > 0;
  const gst = await getOutletGst(order.outletId);
  const bill = computeBill(billLines, { discountPct, serviceChargePct, interState, ...gstBillOptions(gst) });

  const noneLeft = survivors.length === 0;

  const updated = await prisma.$transaction(async (tx) => {
    await tx.orderItem.update({ where: { id: itemId }, data: { kotStatus: 'void' } });
    await tx.order.update({
      where: { id: orderId },
      data: {
        subtotalPaise: bill.subtotalPaise,
        discountPaise: bill.discountPaise,
        cgstPaise: bill.cgstPaise,
        sgstPaise: bill.sgstPaise,
        igstPaise: bill.igstPaise,
        serviceChargePaise: bill.serviceChargePaise,
        roundOffPaise: bill.roundOffPaise,
        totalPaise: bill.totalPaise,
        ...(noneLeft ? { status: 'cancelled' } : {}),
      },
    });
    // restore the raw materials this line had consumed
    await reverseRecipeConsumption(tx, { outletId: session.outletId, orderId, lines: [{ itemId: target.itemId, qty: target.qty }] });
    return tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: { where: { kotStatus: { not: 'void' } } }, table: { select: { label: true } } },
    });
  });

  await prisma.auditLog.create({
    data: {
      outletId: session.outletId, actorId: session.staffId, action: 'order.item_voided', entity: 'order_item', entityId: itemId,
      after: { orderId, name: target.nameSnapshot, qty: target.qty, cancelled: noneLeft } as Prisma.InputJsonValue,
    },
  }).catch(() => {});

  // refresh the KDS — ticket without the voided line, or gone if cancelled
  publish(session.outletId, { type: 'order.updated', ticket: toTicket(updated) });

  return NextResponse.json({ ok: true, cancelled: noneLeft, totalPaise: updated.totalPaise });
}
