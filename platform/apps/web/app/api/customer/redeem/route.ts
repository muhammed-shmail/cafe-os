import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '@cafeos/db';
import { resolveTable, resolveCustomerId } from '@/lib/customer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({ rewardId: z.string().uuid(), t: z.string().optional() });

/**
 * POST /api/customer/redeem — burn points for a reward, issue a coupon.
 * Server checks the balance and decrements atomically (append-only ledger +
 * customer balance + coupon row in one transaction).
 */
export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'invalid' }, { status: 400 });

  const table = await resolveTable(parsed.data.t);
  if (!table) return NextResponse.json({ error: 'table_not_found' }, { status: 404 });

  const customerId = await resolveCustomerId(table.outlet.tenantId);
  if (!customerId) return NextResponse.json({ error: 'not_identified' }, { status: 401 });

  const reward = await prisma.rewardCatalog.findUnique({ where: { id: parsed.data.rewardId } });
  if (!reward || !reward.active) return NextResponse.json({ error: 'reward_unavailable' }, { status: 404 });

  const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { points: true } });
  if (!customer || customer.points < reward.costPoints) {
    return NextResponse.json({ error: 'insufficient_points' }, { status: 409 });
  }

  const code = 'KH-' + randomBytes(3).toString('hex').toUpperCase();
  const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);

  const [updated] = await prisma.$transaction([
    prisma.customer.update({ where: { id: customerId }, data: { points: { decrement: reward.costPoints } }, select: { points: true, coins: true } }),
    prisma.loyaltyLedger.create({ data: { customerId, type: 'burn', points: reward.costPoints, source: 'reward', refId: reward.id } }),
    prisma.coupon.create({ data: { tenantId: table.outlet.tenantId, customerId, code, rewardId: reward.id, status: 'issued', source: 'redeem', expiresAt: expires } }),
  ]);

  return NextResponse.json({ ok: true, coupon: { code, name: reward.name }, balance: { points: updated.points, coins: updated.coins } });
}
