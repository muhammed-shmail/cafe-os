import { prisma, type Prisma } from '@cafeos/db';
import { getOutletPwa, walletPointsToPaise, tierForCustomer, tierDisplayName, type PwaConfig } from './pwa';

/**
 * Cafe OS — Customer Management & Loyalty CRM (server-only).
 *
 * The CRM is a read-and-surface layer over the existing loyalty backend: the
 * tenant-scoped `Customer` model, the append-only `LoyaltyLedger`, `Order`,
 * `GameSession` and `Coupon`. Nothing here mutates loyalty rules — mutations
 * live in the dashboard API routes and always write the ledger + an AuditLog.
 *
 * "Wallet balance" is the ₹-equivalent of a customer's points under the outlet's
 * wallet conversion rate (`walletPointsToPaise`); there is no separate money
 * balance. Money is integer paise throughout (see @cafeos/core).
 */

/** A customer is "high value" at/above this lifetime spend. */
export const HIGH_VALUE_PAISE = 500_000; // ₹5,000
/** No visit within this many days ⇒ "inactive". */
export const INACTIVE_DAYS = 60;

export type CustomerFilter = 'all' | 'new' | 'repeat' | 'high_value' | 'inactive' | 'loyalty';

export interface CustomerListRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  gender: string | null;
  birthday: string | null;
  source: string;
  status: string;
  tier: string;
  tierName: string;
  totalOrders: number;
  totalSpendPaise: number;
  points: number;
  walletBalancePaise: number;
  lastVisit: string | null;
  createdAt: string;
}

export interface CustomerListResult {
  rows: CustomerListRow[];
  page: number;
  pageSize: number;
  total: number;
}

export interface CustomerAnalytics {
  totalCustomers: number;
  newThisMonth: number;
  repeatCustomerRate: number; // %
  retentionRate: number;      // %  (active within 30d)
  avgSpendPaise: number;
  topSpenders: { id: string; name: string; spendPaise: number }[];
  mostLoyal: { id: string; name: string; visits: number }[];
  highestPoints: { id: string; name: string; points: number }[];
}

export interface TimelineEntry {
  at: string;
  kind: 'registered' | 'order' | 'points' | 'game' | 'reward';
  label: string;
  meta?: Record<string, unknown>;
}

export interface CustomerProfile {
  personal: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    gender: string | null;
    address: string | null;
    notes: string | null;
    birthday: string | null;
    status: string;
    source: string;
    registeredAt: string;
    firstVisit: string | null;
  };
  business: {
    totalOrders: number;
    totalSpendPaise: number;
    avgOrderValuePaise: number;
    lastOrderDate: string | null;
    preferredItems: { name: string; qty: number }[];
  };
  loyalty: {
    points: number;
    walletBalancePaise: number;
    tier: string;
    tierName: string;
    totalPointsEarned: number;
    totalPointsRedeemed: number;
    coins: number;
  };
  gaming: {
    gamesPlayed: number;
    gamesWon: number;
    rewardsEarned: number;
  };
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const startOfThisMonth = () => {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), 1);
};
const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
const looksLikeUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

function filterWhere(filter: CustomerFilter): Prisma.CustomerWhereInput {
  switch (filter) {
    case 'new':
      return { createdAt: { gte: startOfThisMonth() } };
    case 'repeat':
      return { visitCount: { gte: 2 } };
    case 'high_value':
      return { lifetimeSpendPaise: { gte: HIGH_VALUE_PAISE } };
    case 'inactive':
      return { OR: [{ lastVisit: null }, { lastVisit: { lt: daysAgo(INACTIVE_DAYS) } }] };
    case 'loyalty':
      return { points: { gt: 0 } };
    default:
      return {};
  }
}

/** Paginated, searchable, filterable customer list for the admin dashboard. */
export async function listCustomers(
  tenantId: string,
  outletId: string,
  opts: { search?: string; filter?: CustomerFilter; page?: number; pageSize?: number } = {},
): Promise<CustomerListResult> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 25));
  const cfg = await getOutletPwa(outletId);

  const search = (opts.search ?? '').trim();
  const searchWhere: Prisma.CustomerWhereInput = !search
    ? {}
    : looksLikeUuid(search)
      ? { id: search }
      : { OR: [{ name: { contains: search, mode: 'insensitive' } }, { phone: { contains: search } }] };

  const where: Prisma.CustomerWhereInput = { tenantId, ...filterWhere(opts.filter ?? 'all'), ...searchWhere };

  const [total, customers] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      orderBy: [{ lastVisit: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, name: true, phone: true, email: true, gender: true, birthday: true,
        source: true, status: true, tier: true, points: true, lifetimeSpendPaise: true,
        visitCount: true, lastVisit: true, createdAt: true,
      },
    }),
  ]);

  // order counts for just this page
  const ids = customers.map((c) => c.id);
  const orderCounts = ids.length
    ? await prisma.order.groupBy({
        by: ['customerId'],
        where: { customerId: { in: ids }, status: { not: 'cancelled' } },
        _count: true,
      })
    : [];
  const countBy = new Map(orderCounts.map((o) => [o.customerId, o._count]));

  return {
    rows: customers.map((c) => ({
      id: c.id,
      name: c.name ?? 'Guest',
      phone: c.phone,
      email: c.email,
      gender: c.gender,
      birthday: iso(c.birthday),
      source: c.source,
      status: c.status,
      tier: c.tier,
      tierName: tierDisplayName(c.tier, cfg),
      totalOrders: countBy.get(c.id) ?? 0,
      totalSpendPaise: c.lifetimeSpendPaise,
      points: c.points,
      walletBalancePaise: walletPointsToPaise(c.points, cfg),
      lastVisit: iso(c.lastVisit),
      createdAt: iso(c.createdAt)!,
    })),
    page,
    pageSize,
    total,
  };
}

/** Full profile (personal / business / loyalty / gaming) for one customer. */
export async function getCustomerProfile(
  tenantId: string,
  outletId: string,
  customerId: string,
): Promise<CustomerProfile | null> {
  const c = await prisma.customer.findFirst({ where: { id: customerId, tenantId } });
  if (!c) return null;
  const cfg = await getOutletPwa(outletId);

  const [orders, ledgerByType, adjPos, adjNeg, gamesPlayed, gamesWon, rewardsEarned] = await Promise.all([
    prisma.order.findMany({
      where: { customerId, status: { not: 'cancelled' } },
      orderBy: { placedAt: 'desc' },
      select: { id: true, placedAt: true, totalPaise: true },
    }),
    prisma.loyaltyLedger.groupBy({ by: ['type'], where: { customerId }, _sum: { points: true } }),
    prisma.loyaltyLedger.aggregate({ where: { customerId, type: 'adjust', points: { gt: 0 } }, _sum: { points: true } }),
    prisma.loyaltyLedger.aggregate({ where: { customerId, type: 'adjust', points: { lt: 0 } }, _sum: { points: true } }),
    prisma.gameSession.count({ where: { customerId } }),
    prisma.gameSession.count({ where: { customerId, rewardCouponId: { not: null } } }),
    prisma.coupon.count({ where: { customerId } }),
  ]);

  const orderIds = orders.map((o) => o.id);
  const preferred = orderIds.length
    ? await prisma.orderItem.groupBy({
        by: ['nameSnapshot'],
        where: { orderId: { in: orderIds } },
        _sum: { qty: true },
        orderBy: { _sum: { qty: 'desc' } },
        take: 5,
      })
    : [];

  const totalSpendPaise = c.lifetimeSpendPaise;
  const totalOrders = orders.length;
  const sumBy = (t: string) => ledgerByType.find((l) => l.type === t)?._sum.points ?? 0;
  const current = tierForCustomer(c.lifetimeSpendPaise, c.visitCount, cfg);

  return {
    personal: {
      id: c.id,
      name: c.name ?? 'Guest',
      phone: c.phone,
      email: c.email,
      gender: c.gender,
      address: c.address,
      notes: c.notes,
      birthday: iso(c.birthday),
      status: c.status,
      source: c.source,
      registeredAt: iso(c.createdAt)!,
      firstVisit: iso(c.firstVisit),
    },
    business: {
      totalOrders,
      totalSpendPaise,
      avgOrderValuePaise: totalOrders > 0 ? Math.round(totalSpendPaise / totalOrders) : 0,
      lastOrderDate: iso(orders[0]?.placedAt ?? null),
      preferredItems: preferred.map((p) => ({ name: p.nameSnapshot, qty: p._sum.qty ?? 0 })),
    },
    loyalty: {
      points: c.points,
      walletBalancePaise: walletPointsToPaise(c.points, cfg),
      tier: current.tier,
      tierName: current.displayName,
      // earn + positive admin adjustments; redeemed = burns + expiries + |negative adjustments|
      totalPointsEarned: sumBy('earn') + (adjPos._sum.points ?? 0),
      totalPointsRedeemed: sumBy('burn') + sumBy('expire') + Math.abs(adjNeg._sum.points ?? 0),
      coins: c.coins,
    },
    gaming: { gamesPlayed, gamesWon, rewardsEarned },
  };
}

/** Merged, date-sorted activity feed for one customer. */
export async function getCustomerTimeline(tenantId: string, customerId: string): Promise<TimelineEntry[]> {
  const c = await prisma.customer.findFirst({ where: { id: customerId, tenantId }, select: { createdAt: true } });
  if (!c) return [];

  const [orders, ledger, games, coupons] = await Promise.all([
    prisma.order.findMany({
      where: { customerId, status: { not: 'cancelled' } },
      orderBy: { placedAt: 'desc' }, take: 50,
      select: { number: true, totalPaise: true, placedAt: true },
    }),
    prisma.loyaltyLedger.findMany({
      where: { customerId }, orderBy: { createdAt: 'desc' }, take: 100,
      select: { type: true, points: true, coins: true, source: true, createdAt: true },
    }),
    prisma.gameSession.findMany({
      where: { customerId }, orderBy: { startedAt: 'desc' }, take: 50,
      select: { startedAt: true, game: { select: { name: true } } },
    }),
    prisma.coupon.findMany({
      where: { customerId }, orderBy: { createdAt: 'desc' }, take: 50,
      select: { code: true, status: true, source: true, createdAt: true },
    }),
  ]);

  const entries: TimelineEntry[] = [];
  entries.push({ at: c.createdAt.toISOString(), kind: 'registered', label: 'Customer registered' });
  for (const o of orders) entries.push({ at: o.placedAt.toISOString(), kind: 'order', label: `Order #${o.number}`, meta: { totalPaise: o.totalPaise } });
  for (const l of ledger) {
    const sign = l.type === 'earn' || (l.type === 'adjust' && l.points >= 0) ? '+' : '−';
    const amt = Math.abs(l.points);
    const label = l.points !== 0 ? `${sign}${amt} points (${l.source})` : `${l.coins} coins (${l.source})`;
    entries.push({ at: l.createdAt.toISOString(), kind: 'points', label, meta: { type: l.type, source: l.source } });
  }
  for (const g of games) entries.push({ at: g.startedAt.toISOString(), kind: 'game', label: `Played ${g.game?.name ?? 'a game'}` });
  for (const cp of coupons) entries.push({ at: cp.createdAt.toISOString(), kind: 'reward', label: `Reward ${cp.code} (${cp.status})`, meta: { source: cp.source } });

  return entries.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 80);
}

/** Dashboard analytics widgets for the whole tenant customer base. */
export async function getCustomerAnalytics(tenantId: string): Promise<CustomerAnalytics> {
  const [total, newThisMonth, repeat, activeRecent, spendAgg, topSpenders, mostLoyal, highestPoints] = await Promise.all([
    prisma.customer.count({ where: { tenantId } }),
    prisma.customer.count({ where: { tenantId, createdAt: { gte: startOfThisMonth() } } }),
    prisma.customer.count({ where: { tenantId, visitCount: { gte: 2 } } }),
    prisma.customer.count({ where: { tenantId, lastVisit: { gte: daysAgo(30) } } }),
    prisma.customer.aggregate({ where: { tenantId }, _avg: { lifetimeSpendPaise: true } }),
    prisma.customer.findMany({ where: { tenantId }, orderBy: { lifetimeSpendPaise: 'desc' }, take: 5, select: { id: true, name: true, lifetimeSpendPaise: true } }),
    prisma.customer.findMany({ where: { tenantId }, orderBy: { visitCount: 'desc' }, take: 5, select: { id: true, name: true, visitCount: true } }),
    prisma.customer.findMany({ where: { tenantId }, orderBy: { points: 'desc' }, take: 5, select: { id: true, name: true, points: true } }),
  ]);

  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
  return {
    totalCustomers: total,
    newThisMonth,
    repeatCustomerRate: pct(repeat),
    retentionRate: pct(activeRecent),
    avgSpendPaise: Math.round(spendAgg._avg.lifetimeSpendPaise ?? 0),
    topSpenders: topSpenders.map((c) => ({ id: c.id, name: c.name ?? 'Guest', spendPaise: c.lifetimeSpendPaise })),
    mostLoyal: mostLoyal.map((c) => ({ id: c.id, name: c.name ?? 'Guest', visits: c.visitCount })),
    highestPoints: highestPoints.map((c) => ({ id: c.id, name: c.name ?? 'Guest', points: c.points })),
  };
}
