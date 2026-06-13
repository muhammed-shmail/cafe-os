import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@cafeos/db';
import { resolveTable, activeOrderForTable, resolveCustomerId, CUSTOMER_COOKIE } from '@/lib/customer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/customer/context?t=<qrToken> — everything the PWA needs on load:
 * outlet branding, table, current order, loyalty snapshot, rewards catalog,
 * spins remaining. Binds (and sets) the customer cookie for this device.
 */
export async function GET(req: NextRequest) {
  const t = req.nextUrl.searchParams.get('t');
  const table = await resolveTable(t);
  if (!table) return NextResponse.json({ error: 'table_not_found' }, { status: 404 });

  const tenantId = table.outlet.tenantId;
  const customerId = await resolveCustomerId(tenantId);

  const [order, customer, rewards] = await Promise.all([
    activeOrderForTable(table.id),
    customerId
      ? prisma.customer.findUnique({
          where: { id: customerId },
          select: { id: true, name: true, tier: true, points: true, coins: true, visitCount: true, referralCode: true },
        })
      : null,
    prisma.rewardCatalog.findMany({ where: { tenantId, active: true }, orderBy: { costPoints: 'asc' } }),
  ]);

  const spinsLeft = await spinsRemaining(customerId, order?.id ?? null);

  const res = NextResponse.json({
    outlet: { name: table.outlet.name.split('—')[0]?.trim() ?? table.outlet.name },
    table: { label: table.label, token: table.qrToken },
    order: order
      ? {
          id: order.id, number: order.number, status: order.status, type: order.type,
          table: order.table?.label ?? table.label, placedAt: order.placedAt.getTime(),
          items: order.items.map((i) => ({ name: i.nameSnapshot, qty: i.qty, station: i.station })),
        }
      : null,
    customer: customer
      ? { name: customer.name ?? 'Guest', tier: customer.tier, points: customer.points, coins: customer.coins, visits: customer.visitCount, referral: customer.referralCode }
      : null,
    rewards: rewards.map((r) => ({ id: r.id, name: r.name, type: r.type, cost: r.costPoints })),
    spinsLeft,
  });

  if (customerId) {
    res.cookies.set(CUSTOMER_COOKIE, customerId, { httpOnly: false, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 90 });
  }
  return res;
}

/** 1 spin per visit (per active order); if no order, 1 per calendar day. */
export async function spinsRemaining(customerId: string | null, orderId: string | null): Promise<number> {
  if (!customerId) return 0;
  const { prisma } = await import('@cafeos/db');
  if (orderId) {
    const used = await prisma.gameSession.count({ where: { customerId, orderId } });
    return used > 0 ? 0 : 1;
  }
  const since = new Date(); since.setHours(0, 0, 0, 0);
  const usedToday = await prisma.gameSession.count({ where: { customerId, startedAt: { gte: since } } });
  return usedToday > 0 ? 0 : 1;
}
