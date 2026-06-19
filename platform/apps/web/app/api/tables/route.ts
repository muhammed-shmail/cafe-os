import { NextResponse } from 'next/server';
import { prisma } from '@cafeos/db';
import { getActiveOutlet } from '@/lib/context';

export const dynamic = 'force-dynamic';

/**
 * GET /api/tables — floor map for the active outlet, with live occupancy.
 * A table is "occupied" while it has an active dine-in order that hasn't been
 * settled or cancelled (i.e. right up until the bill is paid).
 */
export async function GET() {
  const outlet = await getActiveOutlet();
  const [tables, activeOrders] = await Promise.all([
    prisma.tableMap.findMany({
      where: { outletId: outlet.id },
      orderBy: { label: 'asc' },
      select: { id: true, label: true, seats: true, state: true },
    }),
    prisma.order.findMany({
      // occupied = active dine-in order that hasn't been paid: not settled by the
      // dashboard (status) nor charged at the till (settledAt), and not cancelled.
      where: { outletId: outlet.id, tableId: { not: null }, type: 'dine_in', status: { in: ['open', 'in_kitchen', 'ready', 'served'] }, settledAt: null },
      orderBy: { placedAt: 'asc' },
      select: { tableId: true, number: true, placedAt: true, totalPaise: true, status: true },
    }),
  ]);

  // fold the active orders into a per-table occupancy summary
  const occMap = new Map<string, { number: number; sinceMs: number; billPaise: number; orders: number; status: string }>();
  for (const o of activeOrders) {
    if (!o.tableId) continue;
    const cur = occMap.get(o.tableId);
    if (cur) {
      cur.billPaise += o.totalPaise;
      cur.orders += 1;
      cur.status = o.status; // latest (orders are asc, so this ends on the newest)
    } else {
      occMap.set(o.tableId, { number: o.number, sinceMs: o.placedAt.getTime(), billPaise: o.totalPaise, orders: 1, status: o.status });
    }
  }

  const occupied = Object.fromEntries(occMap);
  return NextResponse.json({ tables, occupied });
}
