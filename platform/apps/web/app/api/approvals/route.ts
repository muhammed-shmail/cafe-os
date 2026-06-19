import { NextRequest, NextResponse } from 'next/server';
import { prisma, type Prisma, type Station } from '@cafeos/db';
import { computeBill, type BillLine } from '@cafeos/core';
import { getSession } from '@/lib/auth';
import { publish, toTicket } from '@/lib/realtime';
import { applyRecipeConsumption, emitLowStockAlerts } from '@/lib/inventory';
import { alertOrderCancelled } from '@/lib/alerts';
import { getOutletGst, gstBillOptions, type GstConfig } from '@/lib/tax';
import { reverseWalletHold } from '@/lib/wallet';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Kitchen staff don't approve; everyone else front-of-house can. */
function canApprove(role: string) {
  return role === 'owner' || role === 'manager' || role === 'cashier' || role === 'waiter';
}

type OrderWithItems = Prisma.OrderGetPayload<{ include: { items: true; table: { select: { label: true } } } }>;

/** shape a pending order for the approvals UI (shared by GET and the edit POSTs) */
function toPending(o: OrderWithItems) {
  return {
    id: o.id,
    number: o.number,
    table: o.table?.label ?? '—',
    channel: o.channel,
    placedAt: o.placedAt.getTime(),
    totalPaise: o.totalPaise,
    items: o.items.map((i) => ({ id: i.id, name: i.nameSnapshot, qty: i.qty, station: i.station, notes: i.notes, unitPricePaise: i.unitPricePaise })),
  };
}

/**
 * Recompute an order's money fields from a given set of lines, preserving the
 * order's original discount / service-charge / inter-state shape. GST rate isn't
 * stored on OrderItem, so it's sourced from the menu item (fallback 0).
 */
async function recompute(
  tx: Prisma.TransactionClient,
  order: { subtotalPaise: number; discountPaise: number; serviceChargePaise: number; igstPaise: number },
  lines: { itemId: string | null; unitPricePaise: number; qty: number; modifiers: unknown }[],
  gst: GstConfig,
) {
  const ids = lines.map((l) => l.itemId).filter((id): id is string => !!id);
  const gstByItem = new Map<string, number>();
  if (ids.length) {
    const mis = await tx.menuItem.findMany({ where: { id: { in: ids } }, select: { id: true, gstRate: true } });
    for (const m of mis) gstByItem.set(m.id, Number(m.gstRate));
  }
  const billLines: BillLine[] = lines.map((l) => ({
    pricePaise: l.unitPricePaise,
    modPaise: Array.isArray(l.modifiers) ? (l.modifiers as { pricePaise: number }[]).reduce((s, m) => s + (m.pricePaise ?? 0), 0) : 0,
    gstRate: (l.itemId && gstByItem.get(l.itemId)) || 0,
    qty: l.qty,
  }));
  const taxable = order.subtotalPaise - order.discountPaise;
  const discountPct = order.subtotalPaise > 0 ? (order.discountPaise / order.subtotalPaise) * 100 : 0;
  const serviceChargePct = taxable > 0 ? (order.serviceChargePaise / taxable) * 100 : 0;
  return computeBill(billLines, { discountPct, serviceChargePct, interState: order.igstPaise > 0, ...gstBillOptions(gst) });
}

const moneyFields = (b: ReturnType<typeof computeBill>) => ({
  subtotalPaise: b.subtotalPaise,
  discountPaise: b.discountPaise,
  cgstPaise: b.cgstPaise,
  sgstPaise: b.sgstPaise,
  igstPaise: b.igstPaise,
  serviceChargePaise: b.serviceChargePaise,
  roundOffPaise: b.roundOffPaise,
  totalPaise: b.totalPaise,
});

/** GET /api/approvals — QR orders awaiting approval for the session's outlet. */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const orders = await prisma.order.findMany({
    where: { outletId: session.outletId, status: 'pending_approval' },
    orderBy: { placedAt: 'asc' },
    include: { items: { orderBy: { id: 'asc' } }, table: { select: { label: true } } },
  });

  return NextResponse.json({ orders: orders.map(toPending) });
}

/**
 * POST /api/approvals — { orderId, action: 'approve' | 'reject', reason? }.
 * approve → cut KOTs, deduct recipe stock, send to KDS, stamp approver.
 * reject  → cancel, audit the reason. Either way the QR notification is cleared.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!canApprove(session.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { orderId, action, reason } = body;
  const VALID = ['approve', 'reject', 'update_item', 'delete_item'];
  if (!orderId || !VALID.includes(action)) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order || order.outletId !== session.outletId) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (order.status !== 'pending_approval') {
    return NextResponse.json({ error: 'already_processed', status: order.status }, { status: 409 });
  }

  const gst = await getOutletGst(order.outletId);

  // ---------------- edit a pending line (qty) ----------------
  if (action === 'update_item') {
    const itemId = body.itemId as string;
    const qty = Math.round(Number(body.qty));
    if (!itemId || !Number.isFinite(qty) || qty < 1 || qty > 99) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    const target = order.items.find((i) => i.id === itemId);
    if (!target) return NextResponse.json({ error: 'item_not_found' }, { status: 404 });

    const nextLines = order.items.map((i) => (i.id === itemId ? { ...i, qty } : i));
    const updated = await prisma.$transaction(async (tx) => {
      await tx.orderItem.update({ where: { id: itemId }, data: { qty } });
      const bill = await recompute(tx, order, nextLines, gst);
      await tx.order.update({ where: { id: orderId }, data: moneyFields(bill) });
      await tx.auditLog.create({
        data: { outletId: session.outletId, actorId: session.staffId, action: 'order.item_qty_changed', entity: 'order_item', entityId: itemId, after: { from: target.qty, to: qty, name: target.nameSnapshot } as Prisma.InputJsonValue },
      });
      return tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: { orderBy: { id: 'asc' } }, table: { select: { label: true } } } });
    });
    return NextResponse.json({ ok: true, order: toPending(updated) });
  }

  // ---------------- remove a pending line (reason required) ----------------
  if (action === 'delete_item') {
    const itemId = body.itemId as string;
    const why = String(reason ?? '').trim();
    if (!itemId) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    if (!why) return NextResponse.json({ error: 'reason_required', message: 'A reason is required to remove an item.' }, { status: 400 });
    const target = order.items.find((i) => i.id === itemId);
    if (!target) return NextResponse.json({ error: 'item_not_found' }, { status: 404 });

    const remaining = order.items.filter((i) => i.id !== itemId);
    if (remaining.length === 0) {
      return NextResponse.json({ error: 'last_item', message: 'This is the only item — reject the whole order instead.' }, { status: 409 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.orderItem.delete({ where: { id: itemId } });
      const bill = await recompute(tx, order, remaining, gst);
      await tx.order.update({ where: { id: orderId }, data: moneyFields(bill) });
      await tx.auditLog.create({
        data: { outletId: session.outletId, actorId: session.staffId, action: 'order.item_removed', entity: 'order_item', entityId: itemId, after: { name: target.nameSnapshot, qty: target.qty, reason: why } as Prisma.InputJsonValue },
      });
      return tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: { orderBy: { id: 'asc' } }, table: { select: { label: true } } } });
    });
    return NextResponse.json({ ok: true, order: toPending(updated) });
  }

  // ---------------- reject ----------------
  if (action === 'reject') {
    const updated = await prisma.$transaction(async (tx) => {
      const o = await tx.order.update({
        where: { id: orderId },
        data: { status: 'cancelled', approvedById: session.staffId, approvedAt: new Date() },
        include: { items: { orderBy: { id: 'asc' } }, table: { select: { label: true } } },
      });
      await clearNotification(tx, orderId);
      await tx.auditLog.create({
        data: {
          outletId: session.outletId,
          actorId: session.staffId,
          action: 'order.rejected',
          entity: 'order',
          entityId: orderId,
          after: { reason: reason ?? null } as Prisma.InputJsonValue,
        },
      });
      return o;
    });
    await reverseWalletHold(orderId); // refund any provisional wallet points
    publish(session.outletId, { type: 'order.updated', ticket: toTicket(updated) });
    await alertOrderCancelled(session.outletId, { number: updated.number, by: session.name, totalPaise: updated.totalPaise });
    return NextResponse.json({ ok: true, status: 'cancelled' });
  }

  // ---------------- approve ----------------
  const stations = Array.from(
    new Set(order.items.map((i) => i.station).filter((s): s is Station => !!s)),
  );

  let consumed: string[] = [];
  const updated = await prisma.$transaction(async (tx) => {
    const o = await tx.order.update({
      where: { id: orderId },
      data: {
        status: 'in_kitchen', // approved → straight onto the pass
        approvedById: session.staffId,
        approvedAt: new Date(),
        kots: {
          create: stations.map((station, idx) => ({
            outletId: session.outletId,
            station,
            number: order.number * 10 + idx,
            status: 'queued',
          })),
        },
      },
      include: { items: { orderBy: { id: 'asc' } }, table: { select: { label: true } } },
    });

    // now that it's confirmed, deduct recipe stock (deferred from placement)
    consumed = await applyRecipeConsumption(tx, {
      outletId: session.outletId,
      orderId,
      lines: order.items.map((i) => ({ itemId: i.itemId, qty: i.qty })),
    });

    await clearNotification(tx, orderId);
    await tx.auditLog.create({
      data: {
        outletId: session.outletId,
        actorId: session.staffId,
        action: 'order.approved',
        entity: 'order',
        entityId: orderId,
        after: { approvedBy: session.name } as Prisma.InputJsonValue,
      },
    });
    return o;
  });

  await emitLowStockAlerts(session.outletId, consumed);
  // now it reaches the KDS (and the POS live rail + the customer's table stream)
  publish(session.outletId, { type: 'order.new', ticket: toTicket(updated) });

  return NextResponse.json({ ok: true, status: 'in_kitchen', approvedBy: session.name });
}

/** Mark the QR order's pending notification as read. */
async function clearNotification(tx: Prisma.TransactionClient, orderId: string) {
  await tx.notification.updateMany({
    where: { entity: 'order', entityId: orderId, type: 'qr_order', readAt: null },
    data: { readAt: new Date() },
  });
}
