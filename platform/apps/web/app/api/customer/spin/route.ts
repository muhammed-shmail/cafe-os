import { NextRequest, NextResponse } from 'next/server';
import { randomBytes, randomInt } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '@cafeos/db';
import { resolveTable, activeOrderForTable, resolveCustomerId } from '@/lib/customer';
import { WHEEL, WHEEL_TOTAL_WEIGHT, pickIndex } from '@/lib/wheel';
import { getOutletPwa, gameUnlocked, startOfTodayIST } from '@/lib/pwa';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({ t: z.string().optional(), fingerprint: z.string().max(120).optional() });

/**
 * POST /api/customer/spin — SERVER-AUTHORITATIVE Spin-the-Wheel.
 *
 * Anti-cheat (Phase-1 basics, per spec):
 *  - the prize is decided here, never by the client (client only animates to `index`)
 *  - 1 spin per visit (active order) — enforced by counting GameSession rows, not a cookie
 *  - every spin records device fingerprint + IP for abuse forensics
 * Coins are credited to the append-only loyalty ledger + customer balance atomically.
 */
export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'invalid' }, { status: 400 });

  const table = await resolveTable(parsed.data.t);
  if (!table) return NextResponse.json({ error: 'table_not_found' }, { status: 404 });

  const tenantId = table.outlet.tenantId;
  const customerId = await resolveCustomerId(tenantId);
  if (!customerId) return NextResponse.json({ error: 'not_identified' }, { status: 401 });

  const order = await activeOrderForTable(table.id);

  // owner gamification gating (additive — defaults leave behaviour unchanged)
  const cfg = await getOutletPwa(table.outlet.id);
  const gate = gameUnlocked(cfg, 'spin_wheel', order?.totalPaise ?? 0);
  if (!gate.ok) return NextResponse.json({ error: gate.reason === 'min_order' ? 'locked' : gate.reason === 'hours' ? 'closed' : 'disabled', minOrderPaise: cfg.gamification.games.find((g) => g.key === 'spin_wheel')?.minOrderPaise ?? 0 }, { status: 403 });

  // optional max-games-per-day cap across ALL games (IST day)
  if (cfg.gamification.maxGamesPerDay > 0) {
    const playedToday = await prisma.gameSession.count({ where: { customerId, startedAt: { gte: startOfTodayIST() } } });
    if (playedToday >= cfg.gamification.maxGamesPerDay) return NextResponse.json({ error: 'day_limit' }, { status: 429 });
  }

  // cap: 1 spin per active order (or per day if no order). Scoped to the
  // spin_wheel game so the Quick Cafe Games (which also write GameSession rows)
  // never silently eat the guest's spin.
  const spinWheel = { game: { key: 'spin_wheel' as const } };
  const cap = order
    ? await prisma.gameSession.count({ where: { customerId, orderId: order.id, ...spinWheel } })
    : await prisma.gameSession.count({ where: { customerId, startedAt: { gte: startOfToday() }, ...spinWheel } });
  if (cap > 0) return NextResponse.json({ error: 'no_spins_left' }, { status: 429 });

  // ensure a Game row exists for spin_wheel (find-or-create)
  let game = await prisma.game.findFirst({ where: { tenantId, key: 'spin_wheel' } });
  if (!game) game = await prisma.game.create({ data: { tenantId, key: 'spin_wheel', name: 'Spin the Wheel', active: true } });

  // --- authoritative result (crypto-fair, server-side only) ---
  // owner can override the per-segment odds; default uses the wheel's own weights.
  const ow = cfg.gamification.spin.weights;
  let index: number;
  if (ow && ow.length === WHEEL.length && ow.some((w) => w > 0)) {
    const total = ow.reduce((a, b) => a + b, 0);
    let r = randomInt(total), acc = 0;
    index = WHEEL.length - 1;
    for (let i = 0; i < ow.length; i++) { acc += ow[i]!; if (r < acc) { index = i; break; } }
  } else {
    index = pickIndex(randomInt(WHEEL_TOTAL_WEIGHT));
  }
  const seg = WHEEL[index]!;
  const mult = cfg.gamification.spin.pointsMultiplier;
  const coinAward = seg.kind === 'coins' ? Math.max(0, Math.round(Number(seg.value) * mult)) : 0;
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;

  const result = await prisma.$transaction(async (tx) => {
    const session = await tx.gameSession.create({
      data: {
        customerId, outletId: table.outlet.id, gameId: game.id, orderId: order?.id ?? null,
        result: { index, label: seg.label, kind: seg.kind, value: seg.value },
        deviceFingerprint: parsed.data.fingerprint ?? null, ip,
        endedAt: new Date(),
      },
    });

    let coupon: { code: string } | null = null;
    if (seg.kind === 'coins') {
      await tx.customer.update({ where: { id: customerId }, data: { coins: { increment: coinAward } } });
      await tx.loyaltyLedger.create({ data: { customerId, outletId: table.outlet.id, type: 'earn', coins: coinAward, source: 'game', refId: session.id } });
    } else if (seg.kind === 'coupon') {
      const code = 'KH-' + randomBytes(3).toString('hex').toUpperCase();
      const c = await tx.coupon.create({
        data: { tenantId, customerId, code, status: 'issued', source: 'game', expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14) },
      });
      await tx.gameSession.update({ where: { id: session.id }, data: { rewardCouponId: c.id } });
      coupon = { code };
    }

    const cust = await tx.customer.findUnique({ where: { id: customerId }, select: { points: true, coins: true } });
    return { coupon, balance: cust };
  });

  const res = NextResponse.json({
    index,
    segment: { label: seg.label, kind: seg.kind, value: seg.value },
    coupon: result.coupon,
    balance: result.balance,
    spinsLeft: 0,
  });
  return res;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
