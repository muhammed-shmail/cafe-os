import { NextRequest, NextResponse } from 'next/server';
import { prisma, type KotStatus, type OrderStatus } from '@cafeos/db';
import { AdvanceOrderSchema } from '@cafeos/core';
import { getSession } from '@/lib/auth';
import { publish, toTicket } from '@/lib/realtime';
import { alertOrderCancelled } from '@/lib/alerts';
import { reverseWalletHold } from '@/lib/wallet';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** kitchen lifecycle order used to derive the "next" bump when none is given */
const FLOW: OrderStatus[] = ['open', 'in_kitchen', 'ready', 'served'];
const KOT_FOR: Partial<Record<OrderStatus, KotStatus>> = {
  in_kitchen: 'preparing',
  ready: 'ready',
  served: 'served',
};

/**
 * PATCH /api/orders/:id/status — KDS bump / lifecycle advance.
 * Body may specify { status }, else we advance one step. Scoped to the staff
 * member's outlet. Publishes order.updated so every KDS reflects it live.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const order = await prisma.order.findUnique({ where: { id: params.id }, select: { status: true, outletId: true } });
  if (!order || order.outletId !== session.outletId) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // status: explicit from body, or the next step in the flow
  const body = await req.json().catch(() => ({}));
  let next: OrderStatus;
  const parsed = AdvanceOrderSchema.safeParse(body);
  if (parsed.success) {
    next = parsed.data.status as OrderStatus;
  } else {
    const i = FLOW.indexOf(order.status as OrderStatus);
    next = FLOW[Math.min(i + 1, FLOW.length - 1)] ?? 'served';
  }

  const updated = await prisma.$transaction(async (tx) => {
    const o = await tx.order.update({
      where: { id: params.id },
      data: { status: next },
      include: { items: true, table: { select: { label: true } } },
    });
    const kot = KOT_FOR[next];
    if (kot) await tx.orderItem.updateMany({ where: { orderId: params.id }, data: { kotStatus: kot } });
    return o;
  });

  publish(session.outletId, { type: 'order.updated', ticket: toTicket(updated) });
  if (next === 'cancelled') {
    await reverseWalletHold(params.id); // refund any provisional wallet points
    await alertOrderCancelled(session.outletId, { number: updated.number, by: session.name, totalPaise: updated.totalPaise });
  }
  return NextResponse.json({ ok: true, status: next });
}
