import { NextRequest, NextResponse } from 'next/server';
import { prisma, type Prisma } from '@cafeos/db';
import { CreateOrderSchema, computeBill, type BillLine } from '@cafeos/core';
import { getSession } from '@/lib/auth';
import { publish, toTicket } from '@/lib/realtime';
import { applyRecipeConsumption, emitLowStockAlerts } from '@/lib/inventory';
import { alertLargeDiscount } from '@/lib/alerts';
import { getOutletGst, gstBillOptions } from '@/lib/tax';
import { getOutletPwa } from '@/lib/pwa';
import { assertSlot, bumpUsage, SlotExceeded } from '@/lib/limits';
import { tenantBilling } from '@/lib/billing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/orders
 * Create an order. Idempotent on clientUuid (safe to replay from the offline
 * outbox). Computes the bill server-side (never trust client totals), writes
 * order + items + KOTs, and — if `payment` is present — settles in one
 * transaction. Returns the canonical order.
 */
export async function POST(req: NextRequest) {
  const parsed = CreateOrderSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid', issues: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  // identity comes from the SESSION, never the request body (no spoofing staff/outlet).
  // body staffId/outletId are only honoured for trusted server/offline replays without a session.
  const session = await getSession();
  const staffId = session?.staffId ?? input.staffId ?? null;
  const outletId = session?.outletId ?? input.outletId;

  // idempotency: if we've already seen this clientUuid, return the stored order
  const existing = await prisma.order.findUnique({
    where: { clientUuid: input.clientUuid },
    include: { items: true, payments: true },
  });
  if (existing) return NextResponse.json({ order: existing, idempotent: true });

  // slot enforcement (G6): meter session-bound orders against the monthly quota.
  // Sessionless trusted replays are not metered (already-counted offline orders).
  const meterTenantId = session?.tenantId ?? null;
  if (meterTenantId) {
    // billing wall (G7): a suspended/expired tenant cannot take new orders
    const billing = await tenantBilling(meterTenantId);
    if (billing.blocked) return NextResponse.json({ error: 'tenant_suspended', reason: billing.reason }, { status: 403 });
    try {
      await assertSlot(meterTenantId, 'orders_month');
    } catch (e) {
      if (e instanceof SlotExceeded) {
        return NextResponse.json({ error: 'slot_exceeded', metric: e.metric, limit: e.limit, upsell: true }, { status: 402 });
      }
      throw e;
    }
  }

  // --- authoritative bill (server recomputes; client total is ignored) ---
  const billLines: BillLine[] = input.lines.map((l) => ({
    pricePaise: l.unitPricePaise,
    modPaise: (l.modifiers ?? []).reduce((s, m) => s + m.pricePaise, 0),
    gstRate: l.gstRate,
    qty: l.qty,
  }));
  const gst = await getOutletGst(outletId);
  const pwa = await getOutletPwa(outletId);
  const bill = computeBill(billLines, {
    discountPct: input.discountPct,
    serviceChargePct: input.serviceChargePct,
    interState: input.interState,
    ...gstBillOptions(gst),
  });

  const settling = !!input.payment;
  const number = await nextNumber(outletId);
  // stock items consumed by this order's recipes (captured in-tx, alerted post-commit)
  let consumedStockIds: string[] = [];

  // stations needing a KOT
  const stations = Array.from(
    new Set(input.lines.map((l) => l.station).filter((s): s is 'kitchen' | 'bar' | 'dessert' => !!s)),
  );

  try {
    const order = await prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          clientUuid: input.clientUuid,
          number,
          outletId,
          tableId: input.tableId ?? null,
          customerId: input.customerId ?? null,
          staffId,
          type: input.type,
          // kitchen lifecycle is independent of payment: a paid-upfront takeaway
          // still has to be made, so every new order enters the KDS queue.
          status: 'in_kitchen',
          subtotalPaise: bill.subtotalPaise,
          discountPaise: bill.discountPaise,
          cgstPaise: bill.cgstPaise,
          sgstPaise: bill.sgstPaise,
          igstPaise: bill.igstPaise,
          serviceChargePaise: bill.serviceChargePaise,
          roundOffPaise: bill.roundOffPaise,
          totalPaise: bill.totalPaise,
          settledAt: settling ? new Date() : null,
          items: {
            create: input.lines.map((l) => ({
              itemId: l.itemId,
              nameSnapshot: l.nameSnapshot,
              qty: l.qty,
              unitPricePaise: l.unitPricePaise,
              modifiers: (l.modifiers ?? []) as Prisma.InputJsonValue,
              notes: l.notes,
              station: l.station ?? null,
              kotStatus: 'queued',
            })),
          },
          kots: {
            create: stations.map((station, idx) => ({
              outletId,
              station,
              number: number * 10 + idx,
              status: 'queued',
            })),
          },
        },
        include: { items: true, kots: true, table: { select: { label: true } } },
      });

      if (input.payment) {
        await tx.payment.create({
          data: {
            orderId: created.id,
            outletId,
            method: input.payment.method,
            amountPaise: input.payment.amountPaise,
            status: 'success',
            providerRef: input.payment.providerRef,
            meta: { tipPaise: input.payment.tipPaise } as Prisma.InputJsonValue,
          },
        });

        // loyalty: configurable earn rate (default 1pt per ₹10) + optional first-order bonus,
        // on settle (append-only ledger). Defaults preserve the original behaviour exactly.
        if (input.customerId) {
          const rate = pwa.points.earnRatePaisePerPoint; // paise per earned point
          let points = Math.floor(bill.totalPaise / rate);
          const prior = await tx.customer.findUnique({ where: { id: input.customerId }, select: { visitCount: true } });
          if ((!prior || prior.visitCount === 0) && pwa.loyalty.rewards.firstOrderBonus > 0) {
            points += pwa.loyalty.rewards.firstOrderBonus;
          }
          await tx.loyaltyLedger.create({
            data: { customerId: input.customerId, outletId, type: 'earn', points, source: 'order', refId: created.id },
          });
          await tx.customer.update({
            where: { id: input.customerId },
            data: {
              points: { increment: points },
              lifetimeSpendPaise: { increment: bill.totalPaise },
              visitCount: { increment: 1 },
              lastVisit: new Date(),
            },
          });
        }
      }

      // recipe-based inventory: deduct raw materials + append the stock ledger,
      // atomically with the order. No-ops for items without a recipe.
      consumedStockIds = await applyRecipeConsumption(tx, {
        outletId,
        orderId: created.id,
        lines: input.lines.map((l) => ({ itemId: l.itemId, qty: l.qty })),
      });

      return created;
    });

    // meter the committed order against the tenant's monthly quota (best effort)
    if (meterTenantId) await bumpUsage(meterTenantId, 'orders_month').catch(() => {});

    // fan out to every KDS subscribed to this outlet
    publish(outletId, { type: 'order.new', ticket: toTicket(order) });
    // raise low-stock alerts for anything that dipped below reorder (best effort)
    await emitLowStockAlerts(outletId, consumedStockIds);
    // owner alert: unusually large discount on this ticket
    if (input.discountPct > 0) await alertLargeDiscount(outletId, { number: order.number, discountPct: input.discountPct, discountPaise: bill.discountPaise });
    return NextResponse.json({ order, bill }, { status: 201 });
  } catch (e) {
    // unique violation on clientUuid race → fetch and return idempotently
    const again = await prisma.order.findUnique({ where: { clientUuid: input.clientUuid }, include: { items: true } });
    if (again) return NextResponse.json({ order: again, idempotent: true });
    console.error('order create failed', e);
    return NextResponse.json({ error: 'order_create_failed' }, { status: 500 });
  }
}

/** GET /api/orders?status=in_kitchen — used by the KDS (Phase 1b). */
export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get('status') as
    | 'open' | 'in_kitchen' | 'ready' | 'served' | 'settled' | 'cancelled' | null;
  const orders = await prisma.order.findMany({
    where: status ? { status } : undefined,
    orderBy: { placedAt: 'desc' },
    take: 50,
    include: { items: true, table: true },
  });
  return NextResponse.json({ orders });
}

async function nextNumber(outletId: string): Promise<number> {
  const last = await prisma.order.findFirst({ where: { outletId }, orderBy: { number: 'desc' }, select: { number: true } });
  return (last?.number ?? 100) + 1;
}
