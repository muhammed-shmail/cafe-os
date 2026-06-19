import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@cafeos/db';
import { resolveTable, activeOrderForTable, resolveCustomerId, CUSTOMER_COOKIE } from '@/lib/customer';
import { readPwaConfig, gameUnlocked, tierForCustomer, walletPointsToPaise } from '@/lib/pwa';

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

  const [order, customer, rewards, categories, outletRow] = await Promise.all([
    activeOrderForTable(table.id),
    customerId
      ? prisma.customer.findUnique({
          where: { id: customerId },
          select: { id: true, name: true, tier: true, points: true, coins: true, visitCount: true, referralCode: true, lifetimeSpendPaise: true },
        })
      : null,
    prisma.rewardCatalog.findMany({ where: { tenantId, active: true }, orderBy: { costPoints: 'asc' } }),
    // menu for self-serve QR ordering (Phase C)
    prisma.category.findMany({
      where: { outletId: table.outlet.id },
      orderBy: { sort: 'asc' },
      include: { items: { where: { isAvailable: true }, orderBy: { name: 'asc' }, select: { id: true, name: true, pricePaise: true, tags: true } } },
    }),
    prisma.outlet.findUnique({ where: { id: table.outlet.id }, select: { settings: true } }),
  ]);

  const spinsLeft = await spinsRemaining(customerId, order?.id ?? null);

  // ---- PWA config block (featured dishes, banners, theme, table welcome) ----
  // Additive: every field below is optional for the client; absent config ⇒ the
  // PWA behaves exactly as before.
  const cfg = readPwaConfig(outletRow?.settings);
  const resolved = !!t && table.qrToken === t; // QR matched a real table vs demo fallback
  const registered = req.cookies.get(CUSTOMER_COOKIE)?.value === customerId && !!customerId;
  const featIds = cfg.featured.map((f) => f.itemId);
  const featRows = featIds.length
    ? await prisma.menuItem.findMany({ where: { id: { in: featIds }, outletId: table.outlet.id, isAvailable: true }, select: { id: true, name: true, pricePaise: true, imageUrl: true } })
    : [];
  const featMap = new Map(featRows.map((r) => [r.id, r]));
  const featured = cfg.featured
    .map((f) => {
      const it = featMap.get(f.itemId);
      return it ? { id: it.id, name: it.name, pricePaise: it.pricePaise, imageUrl: f.imageUrl || it.imageUrl || null, label: f.label } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  const today = new Date().toISOString().slice(0, 10);
  const banners = cfg.banners
    .filter((b) => (!b.startAt || b.startAt <= today) && (!b.endAt || b.endAt >= today))
    .map((b) => ({ id: b.id, imageUrl: b.imageUrl, title: b.title, link: b.link }));

  // game-unlock prompt: when an order meets the lowest configured min-order gate
  const orderTotal = order?.totalPaise ?? 0;
  const minGates = cfg.gamification.games.filter((g) => g.enabled && g.minOrderPaise > 0).map((g) => g.minOrderPaise);
  const minOrderPaise = minGates.length ? Math.min(...minGates) : 0;
  const gameUnlock = {
    unlocked: cfg.gamification.enabledGlobal && minOrderPaise > 0 && !!order && gameUnlocked(cfg, '', orderTotal).ok && orderTotal >= minOrderPaise,
    minOrderPaise,
    orderTotalPaise: orderTotal,
  };

  // wallet + loyalty dashboard (only when a customer is resolved)
  let wallet: Record<string, unknown> | null = null;
  let loyalty: Record<string, unknown> | null = null;
  if (customer) {
    const [orderCount, gamesPlayed, rewardsWon] = await Promise.all([
      prisma.order.count({ where: { customerId: customer.id, status: { not: 'cancelled' } } }),
      prisma.gameSession.count({ where: { customerId: customer.id } }),
      prisma.coupon.count({ where: { customerId: customer.id } }),
    ]);
    wallet = {
      enabled: cfg.wallet.enabled,
      points: customer.points,
      balancePaise: walletPointsToPaise(customer.points, cfg),
      redeemablePaise: walletPointsToPaise(customer.points, cfg),
      pointsPerRupee: cfg.wallet.pointsPerRupee,
      minPointsToRedeem: cfg.wallet.minPointsToRedeem,
      maxRedeemPctOfBill: cfg.wallet.maxRedeemPctOfBill,
    };
    const cur = tierForCustomer(customer.lifetimeSpendPaise, customer.visitCount, cfg);
    const sorted = [...cfg.loyalty.tiers].sort((a, b) => a.minSpendPaise - b.minSpendPaise);
    const idx = sorted.findIndex((t) => t.tier === cur.tier);
    const next = idx >= 0 && idx < sorted.length - 1 ? sorted[idx + 1] : null;
    loyalty = {
      orders: orderCount,
      spendPaise: customer.lifetimeSpendPaise,
      points: customer.points,
      gamesPlayed,
      rewardsWon,
      tier: cur.tier,
      tierName: cur.displayName,
      nextTierName: next?.displayName ?? null,
      nextAtSpendPaise: next?.minSpendPaise ?? null,
    };
  }

  const pwa = {
    registration: { enabled: cfg.registration.enabled, collectName: cfg.registration.collectName },
    theme: cfg.theme,
    home: cfg.home,
    welcome: `${cfg.table.welcomePrefix} ${table.label}`,
    manualPick: !resolved && cfg.table.allowManualPick,
    featured,
    banners,
    gameUnlock,
    wallet,
    loyalty,
  };

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
      ? { name: customer.name ?? 'Guest', tier: customer.tier, points: customer.points, coins: customer.coins, visits: customer.visitCount, referral: customer.referralCode, registered }
      : null,
    pwa,
    rewards: rewards.map((r) => ({ id: r.id, name: r.name, type: r.type, cost: r.costPoints })),
    menu: categories
      .filter((c) => c.items.length > 0)
      .map((c) => ({
        id: c.id,
        name: c.name,
        items: c.items.map((i) => ({ id: i.id, name: i.name, pricePaise: i.pricePaise, tags: i.tags })),
      })),
    spinsLeft,
  });

  if (customerId) {
    res.cookies.set(CUSTOMER_COOKIE, customerId, { httpOnly: false, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 90 });
  }
  return res;
}

/**
 * 1 spin per visit (per active order); if no order, 1 per calendar day.
 * Scoped to the spin_wheel game so the Quick Cafe Games' own GameSession rows
 * don't count against the wheel.
 */
async function spinsRemaining(customerId: string | null, orderId: string | null): Promise<number> {
  if (!customerId) return 0;
  const { prisma } = await import('@cafeos/db');
  const spinWheel = { game: { key: 'spin_wheel' as const } };
  if (orderId) {
    const used = await prisma.gameSession.count({ where: { customerId, orderId, ...spinWheel } });
    return used > 0 ? 0 : 1;
  }
  const since = new Date(); since.setHours(0, 0, 0, 0);
  const usedToday = await prisma.gameSession.count({ where: { customerId, startedAt: { gte: since }, ...spinWheel } });
  return usedToday > 0 ? 0 : 1;
}
