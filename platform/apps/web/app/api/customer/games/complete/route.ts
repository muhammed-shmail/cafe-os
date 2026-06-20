import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@cafeos/db';
import { resolveTable, activeOrderForTable, resolveCustomerId } from '@/lib/customer';
import { QUICK_GAMES, QUICK_GAME_MAP, isQuickGameKey, coinsForScore, pointsForCoins } from '@/lib/games/registry';
import { getOutletPwa, gameUnlocked, startOfTodayIST } from '@/lib/pwa';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  t: z.string().optional(),
  game: z.string(),
  score: z.number().int().min(0).max(10_000),
  durationSec: z.number().int().min(0).max(600).optional(),
  fingerprint: z.string().max(120).optional(),
});

/**
 * POST /api/customer/games/complete — SERVER-AUTHORITATIVE reward for the Quick
 * Cafe Games. The client reports a finished round (game key + score); the SERVER
 * decides the coins (never trust client totals — same guarantee as the wheel).
 *
 * Anti-abuse / anti-occupancy (per business requirement — games must not turn
 * into a coin farm that keeps guests at the table):
 *  - coins are computed here from a clamped score via coinsForScore()
 *  - ONE paid play per game per visit (active order). Replays are allowed for
 *    fun but award 0 coins and are flagged `awarded:false`.
 *  - with no active order we fall back to one paid play per game per day
 *  - every play records device fingerprint + IP for forensics
 *
 * Coins + linked loyalty points hit the append-only ledger and the customer
 * balance atomically, and a GameSession row is written for the leaderboard.
 */
export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'invalid' }, { status: 400 });

  const { game: gameKey, score } = parsed.data;
  if (!isQuickGameKey(gameKey)) return NextResponse.json({ error: 'unknown_game' }, { status: 400 });
  const def = QUICK_GAME_MAP[gameKey];

  const table = await resolveTable(parsed.data.t);
  if (!table) return NextResponse.json({ error: 'table_not_found' }, { status: 404 });

  const tenantId = table.outlet.tenantId;
  const customerId = await resolveCustomerId(tenantId);
  if (!customerId) return NextResponse.json({ error: 'not_identified' }, { status: 401 });

  const order = await activeOrderForTable(table.id);

  // owner gamification gating (additive — defaults leave behaviour unchanged)
  const cfg = await getOutletPwa(table.outlet.id);
  const gate = gameUnlocked(cfg, gameKey, order?.totalPaise ?? 0);
  if (!gate.ok) return NextResponse.json({ error: gate.reason === 'min_order' ? 'locked' : gate.reason === 'hours' ? 'closed' : 'disabled', minOrderPaise: cfg.gamification.games.find((g) => g.key === gameKey)?.minOrderPaise ?? 0 }, { status: 403 });
  if (cfg.gamification.maxGamesPerDay > 0) {
    const playedToday = await prisma.gameSession.count({ where: { customerId, startedAt: { gte: startOfTodayIST() } } });
    if (playedToday >= cfg.gamification.maxGamesPerDay) return NextResponse.json({ error: 'day_limit' }, { status: 429 });
  }

  // find-or-create the Game row for this quick game (keyed per tenant)
  let gameRow = await prisma.game.findFirst({ where: { tenantId, key: gameKey } });
  if (!gameRow) gameRow = await prisma.game.create({ data: { tenantId, key: gameKey, name: def.name, active: true } });

  // has this guest already earned on THIS game this visit?
  const since = startOfToday();
  const priorPaid = order
    ? await prisma.gameSession.count({ where: { customerId, gameId: gameRow.id, orderId: order.id } })
    : await prisma.gameSession.count({ where: { customerId, gameId: gameRow.id, startedAt: { gte: since } } });

  const mult = cfg.gamification.games.find((g) => g.key === gameKey)?.pointsMultiplier ?? 1;
  const awarded = priorPaid === 0;
  const coins = awarded ? Math.max(0, Math.round(coinsForScore(gameKey, score) * mult)) : 0;
  const points = awarded ? pointsForCoins(coins) : 0;
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;

  const balance = await prisma.$transaction(async (tx) => {
    const session = await tx.gameSession.create({
      data: {
        customerId,
        outletId: table.outlet.id,
        gameId: gameRow.id,
        orderId: order?.id ?? null,
        result: { score, coins, points, awarded, durationSec: parsed.data.durationSec ?? null },
        deviceFingerprint: parsed.data.fingerprint ?? null,
        ip,
        endedAt: new Date(),
      },
    });

    if (awarded && (coins > 0 || points > 0)) {
      await tx.customer.update({
        where: { id: customerId },
        data: { coins: { increment: coins }, points: { increment: points } },
      });
      await tx.loyaltyLedger.create({
        data: { customerId, outletId: table.outlet.id, type: 'earn', coins, points, source: 'game', refId: session.id },
      });
    }

    return tx.customer.findUnique({ where: { id: customerId }, select: { points: true, coins: true } });
  });

  return NextResponse.json({
    game: gameKey,
    awarded,
    coins,
    points,
    balance,
    // tell the client whether a replay would pay out (drives the "practice round" hint)
    nextPlayPays: false,
  });
}

/** GET — which quick games still have a paid play left this visit (for the hub). */
export async function GET(req: NextRequest) {
  const t = req.nextUrl.searchParams.get('t');
  const table = await resolveTable(t);
  if (!table) return NextResponse.json({ error: 'table_not_found' }, { status: 404 });

  const tenantId = table.outlet.tenantId;
  const customerId = await resolveCustomerId(tenantId);
  if (!customerId) return NextResponse.json({ played: {} });

  const order = await activeOrderForTable(table.id);
  const since = startOfToday();
  const cfg = await getOutletPwa(table.outlet.id);

  const games = await prisma.game.findMany({ where: { tenantId, key: { in: QUICK_GAMES.map((g) => g.key) } }, select: { id: true, key: true } });
  const gameById = new Map(games.map((g) => [g.key, g.id]));
  const played: Record<string, boolean> = {};
  const locked: Record<string, string | false> = {};
  await Promise.all(
    QUICK_GAMES.map(async (qg) => {
      const id = gameById.get(qg.key);
      const n = id
        ? order
          ? await prisma.gameSession.count({ where: { customerId, gameId: id, orderId: order.id } })
          : await prisma.gameSession.count({ where: { customerId, gameId: id, startedAt: { gte: since } } })
        : 0;
      played[qg.key] = n > 0;
      const gate = gameUnlocked(cfg, qg.key, order?.totalPaise ?? 0);
      locked[qg.key] = gate.ok ? false : (gate.reason ?? 'disabled');
    }),
  );
  return NextResponse.json({ played, locked, minOrderPaise: Object.fromEntries(cfg.gamification.games.map((g) => [g.key, g.minOrderPaise])) });
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
