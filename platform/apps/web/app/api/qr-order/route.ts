import { NextRequest, NextResponse } from 'next/server';
import { prisma, type Prisma } from '@cafeos/db';
import { computeBill, type BillLine } from '@cafeos/core';
import { resolveTable, resolveCustomerId } from '@/lib/customer';
import { publish, toTicket } from '@/lib/realtime';
import { createNotification } from '@/lib/notify';
import { getOutletGst, gstBillOptions } from '@/lib/tax';
import { getOutletPwa, walletPointsToPaise, paiseToPoints } from '@/lib/pwa';
import { tenantBilling } from '@/lib/billing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/qr-order — PUBLIC customer ordering from the table QR.
 *
 * Unlike the POS route, a QR order does NOT go straight to the kitchen. It is
 * created as `pending_approval` (channel = qr) and a waiter must approve it
 * (see /api/approvals) before any KOT is cut or stock is consumed. Prices are
 * recomputed server-side from the menu — the client only sends item ids + qty.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.lines) || body.lines.length === 0) {
    return NextResponse.json({ error: 'empty_order' }, { status: 400 });
  }

  const table = await resolveTable(body.t ?? null);
  if (!table) return NextResponse.json({ error: 'table_not_found' }, { status: 404 });
  const outletId = table.outlet.id;
  const tenantId = table.outlet.tenantId;

  // billing wall (G7): suspended/expired tenants can't accept QR orders
  const billing = await tenantBilling(tenantId);
  if (billing.blocked) return NextResponse.json({ error: 'tenant_suspended' }, { status: 403 });

  // resolve requested items from the DB (never trust client prices)
  const wanted = new Map<string, number>();
  for (const l of body.lines) {
    const id = String(l.itemId ?? '');
    const qty = Math.max(0, Math.min(99, Math.floor(Number(l.qty ?? 0))));
    if (id && qty > 0) wanted.set(id, (wanted.get(id) ?? 0) + qty);
  }
  if (wanted.size === 0) return NextResponse.json({ error: 'empty_order' }, { status: 400 });

  const items = await prisma.menuItem.findMany({
    where: { id: { in: [...wanted.keys()] }, outletId, isAvailable: true },
  });
  if (items.length === 0) return NextResponse.json({ error: 'no_valid_items' }, { status: 400 });

  const lines = items.map((it) => ({
    itemId: it.id,
    nameSnapshot: it.name,
    qty: wanted.get(it.id)!,
    unitPricePaise: it.pricePaise,
    gstRate: Number(it.gstRate),
    station: it.station,
  }));

  const customerId = await resolveCustomerId(tenantId);
  const subtotal = lines.reduce((s, l) => s + l.unitPricePaise * l.qty, 0);

  // Optional wallet redemption: spend points as a ₹ discount. computeBill only
  // takes a percentage, so we convert the clamped ₹ amount into an equivalent
  // discountPct (its pro-rata distribution keeps per-line tax correct). The
  // points are a PROVISIONAL hold — burned now, reversed if the order is
  // cancelled/rejected (lib/wallet.ts). Defaults (wallet off) = no change.
  const pwaCfg = await getOutletPwa(outletId);
  let walletPointsUsed = 0;
  let walletDiscountPaise = 0;
  if (pwaCfg.wallet.enabled && customerId && Number(body.walletPoints) > 0) {
    const cust = await prisma.customer.findUnique({ where: { id: customerId }, select: { points: true } });
    const have = cust?.points ?? 0;
    const maxByBill = paiseToPoints(Math.floor((subtotal * pwaCfg.wallet.maxRedeemPctOfBill) / 100), pwaCfg);
    let use = Math.max(0, Math.min(Math.floor(Number(body.walletPoints)), have, maxByBill));
    if (use < pwaCfg.wallet.minPointsToRedeem) use = 0;
    if (use > 0) {
      walletDiscountPaise = Math.min(subtotal, walletPointsToPaise(use, pwaCfg));
      walletPointsUsed = use;
    }
  }
  const discountPct = subtotal > 0 && walletDiscountPaise > 0 ? (walletDiscountPaise / subtotal) * 100 : 0;

  const billLines: BillLine[] = lines.map((l) => ({ pricePaise: l.unitPricePaise, gstRate: l.gstRate, qty: l.qty }));
  const bill = computeBill(billLines, { discountPct, ...gstBillOptions(await getOutletGst(outletId)) });

  const number = await nextNumber(outletId);

  const order = await prisma.$transaction(async (tx) => {
    const o = await tx.order.create({
      data: {
        clientUuid: crypto.randomUUID(),
        number,
        outletId,
        tableId: table.id,
        customerId,
        staffId: null,
        type: 'dine_in',
        channel: 'qr',
        status: 'pending_approval', // <-- gated; not visible to the KDS yet
        subtotalPaise: bill.subtotalPaise,
        discountPaise: bill.discountPaise,
        cgstPaise: bill.cgstPaise,
        sgstPaise: bill.sgstPaise,
        igstPaise: bill.igstPaise,
        roundOffPaise: bill.roundOffPaise,
        totalPaise: bill.totalPaise,
        items: {
          create: lines.map((l) => ({
            itemId: l.itemId,
            nameSnapshot: l.nameSnapshot,
            qty: l.qty,
            unitPricePaise: l.unitPricePaise,
            station: l.station ?? null,
            notes: typeof body.note === 'string' ? body.note.slice(0, 280) : null,
            kotStatus: 'queued',
          })),
        },
      },
      include: { items: true, table: { select: { label: true } } },
    });

    // burn the held points atomically (re-check balance to avoid overspend)
    if (walletPointsUsed > 0 && customerId) {
      const fresh = await tx.customer.findUnique({ where: { id: customerId }, select: { points: true } });
      if ((fresh?.points ?? 0) >= walletPointsUsed) {
        await tx.customer.update({ where: { id: customerId }, data: { points: { decrement: walletPointsUsed } } });
        await tx.loyaltyLedger.create({ data: { customerId, outletId, type: 'burn', points: walletPointsUsed, source: 'wallet', refId: o.id } });
      }
    }
    return o;
  });

  // notify the approval dashboard + write the audit trail
  await createNotification({
    outletId,
    type: 'qr_order',
    severity: 'info',
    title: `New QR order #${order.number}`,
    body: `Table ${table.label} · ${lines.reduce((s, l) => s + l.qty, 0)} items · awaiting approval`,
    entity: 'order',
    entityId: order.id,
    meta: { number: order.number, totalPaise: bill.totalPaise } as Prisma.InputJsonValue,
  });
  await prisma.auditLog.create({
    data: {
      outletId,
      actorId: null,
      action: 'qr_order.placed',
      entity: 'order',
      entityId: order.id,
      after: { number: order.number, table: table.label, totalPaise: bill.totalPaise } as Prisma.InputJsonValue,
    },
  });

  // surface to waiters (and the customer's own table stream) — NOT the KDS
  publish(outletId, { type: 'order.pending', ticket: toTicket(order) });

  return NextResponse.json({ ok: true, order: { id: order.id, number: order.number, status: order.status, totalPaise: bill.totalPaise, discountPaise: bill.discountPaise, walletPointsUsed } }, { status: 201 });
}

async function nextNumber(outletId: string): Promise<number> {
  const last = await prisma.order.findFirst({ where: { outletId }, orderBy: { number: 'desc' }, select: { number: true } });
  return (last?.number ?? 100) + 1;
}
