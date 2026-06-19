/**
 * Cafe OS — Customer PWA configuration.
 *
 * Like occupancy/devices/gst/floors, all PWA config lives in the existing
 * `Outlet.settings` JSON under `pwa` — no schema change, fully reversible. Every
 * reader is defensive and fully-defaulted, so an outlet with no `pwa` block
 * behaves EXACTLY as the app did before this feature: registration off, all
 * games enabled with no min-order gate, wallet off, points at 1pt/₹10.
 *
 * Mirrors the `readX(settings)` pattern in lib/floors.ts.
 *
 * NOTE: this module is imported by the owner dashboard CLIENT (for types +
 * constants like FEATURED_LABELS), so it must stay free of top-level server
 * imports. `getOutletPwa` therefore loads Prisma lazily.
 */

// ----------------------------- types -----------------------------
export type FeaturedLabel = 'best_seller' | 'chef_special' | 'new_arrival' | 'trending';
export const FEATURED_LABELS: { value: FeaturedLabel; label: string }[] = [
  { value: 'best_seller', label: 'Best Seller' },
  { value: 'chef_special', label: 'Chef Special' },
  { value: 'new_arrival', label: 'New Arrival' },
  { value: 'trending', label: 'Trending' },
];

export interface FeaturedDish {
  itemId: string;
  label: FeaturedLabel | null;
  priority: number;
  /** optional image override; falls back to MenuItem.imageUrl when null */
  imageUrl: string | null;
}

export interface PromoBanner {
  id: string;
  imageUrl: string;
  title: string;
  link: string | null;
  startAt: string | null; // ISO date; null = always
  endAt: string | null;
  order: number;
}

export interface PwaRegistrationConfig {
  enabled: boolean; // false ⇒ keep current demo/cookie behaviour
  collectName: boolean;
}

export type HomeSection = 'banners' | 'featured' | 'track' | 'loyalty';

export interface PwaGameConfig {
  key: string; // 'spin_wheel' | quick game key
  enabled: boolean;
  minOrderPaise: number; // 0 = always unlocked
  pointsMultiplier: number; // 1 = default payout
}

export interface PwaGamificationConfig {
  enabledGlobal: boolean;
  maxGamesPerDay: number; // 0 = unlimited
  availability: { startHour: number; endHour: number } | null; // IST hours, null = always
  games: PwaGameConfig[];
  spin: { weights: number[] | null; pointsMultiplier: number }; // weights align to WHEEL order
}

export interface PwaWalletConfig {
  enabled: boolean;
  pointsPerRupee: number; // e.g. 10 points = ₹1
  maxRedeemPctOfBill: number; // cap discount to N% of subtotal
  minPointsToRedeem: number;
}

export interface PwaPointsConfig {
  earnRatePaisePerPoint: number; // 1000 = 1pt per ₹10 (current behaviour)
}

export type TierKey = 'bronze' | 'silver' | 'gold' | 'vip';
export interface PwaTierThreshold {
  tier: TierKey;
  displayName: string; // vip → "Platinum" by default
  minSpendPaise: number;
  minVisits: number;
}
/** Bonus-point rules (DB-ready config; zero everywhere = current behaviour). */
export interface PwaLoyaltyRewards {
  firstOrderBonus: number; // extra points on a customer's first settled order
  birthdayBonus: number;   // points granted on/around the customer's birthday
  referralBonus: number;   // points to the referrer when a referral qualifies
}
export interface PwaLoyaltyConfig {
  tiers: PwaTierThreshold[];
  rewards: PwaLoyaltyRewards;
}

export interface PwaTableConfig {
  welcomePrefix: string;
  allowManualPick: boolean;
}

export interface PwaThemeConfig {
  accent: string | null;
  logoUrl: string | null;
  heroTagline: string;
}

export interface PwaHomeLayout {
  sections: HomeSection[];
}

export interface PwaConfig {
  registration: PwaRegistrationConfig;
  featured: FeaturedDish[];
  banners: PromoBanner[];
  home: PwaHomeLayout;
  gamification: PwaGamificationConfig;
  wallet: PwaWalletConfig;
  points: PwaPointsConfig;
  loyalty: PwaLoyaltyConfig;
  table: PwaTableConfig;
  theme: PwaThemeConfig;
}

// ----------------------------- defaults -----------------------------
/** Quick-game + spin keys whose defaults keep today's behaviour (all on). */
export const DEFAULT_GAME_KEYS = ['spin_wheel', 'imposter', 'emoji_guess', 'word_challenge', 'quick_quiz', 'spot_difference', 'memory_flip'] as const;

export const DEFAULT_TIERS: PwaTierThreshold[] = [
  { tier: 'bronze', displayName: 'Bronze', minSpendPaise: 0, minVisits: 0 },
  { tier: 'silver', displayName: 'Silver', minSpendPaise: 200000, minVisits: 5 },
  { tier: 'gold', displayName: 'Gold', minSpendPaise: 1000000, minVisits: 15 },
  { tier: 'vip', displayName: 'Platinum', minSpendPaise: 5000000, minVisits: 40 },
];

export const DEFAULT_PWA: PwaConfig = {
  registration: { enabled: false, collectName: true },
  featured: [],
  banners: [],
  home: { sections: ['banners', 'track', 'featured', 'loyalty'] },
  gamification: {
    enabledGlobal: true,
    maxGamesPerDay: 0,
    availability: null,
    games: DEFAULT_GAME_KEYS.map((key) => ({ key, enabled: true, minOrderPaise: 0, pointsMultiplier: 1 })),
    spin: { weights: null, pointsMultiplier: 1 },
  },
  wallet: { enabled: false, pointsPerRupee: 10, maxRedeemPctOfBill: 50, minPointsToRedeem: 0 },
  points: { earnRatePaisePerPoint: 1000 },
  loyalty: { tiers: DEFAULT_TIERS, rewards: { firstOrderBonus: 0, birthdayBonus: 0, referralBonus: 0 } },
  table: { welcomePrefix: 'Welcome to Table', allowManualPick: true },
  theme: { accent: null, logoUrl: null, heroTagline: '' },
};

// ----------------------------- helpers -----------------------------
const num = (v: unknown, d: number) => (Number.isFinite(Number(v)) ? Number(v) : d);
const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
const HOME_SECTIONS: HomeSection[] = ['banners', 'featured', 'track', 'loyalty'];
const LABELS = FEATURED_LABELS.map((l) => l.value);
const TIER_KEYS: TierKey[] = ['bronze', 'silver', 'gold', 'vip'];

function readFeatured(raw: unknown): FeaturedDish[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((d): FeaturedDish | null => {
      const o = d as Record<string, unknown>;
      if (!o || typeof o.itemId !== 'string') return null;
      const label = LABELS.includes(o.label as FeaturedLabel) ? (o.label as FeaturedLabel) : null;
      return { itemId: o.itemId, label, priority: num(o.priority, 0), imageUrl: typeof o.imageUrl === 'string' && o.imageUrl ? o.imageUrl : null };
    })
    .filter((d): d is FeaturedDish => d !== null)
    .sort((a, b) => a.priority - b.priority);
}

function readBanners(raw: unknown): PromoBanner[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((b): PromoBanner | null => {
      const o = b as Record<string, unknown>;
      if (!o || typeof o.id !== 'string' || typeof o.imageUrl !== 'string') return null;
      return {
        id: o.id,
        imageUrl: o.imageUrl,
        title: str(o.title),
        link: typeof o.link === 'string' && o.link ? o.link : null,
        startAt: typeof o.startAt === 'string' && o.startAt ? o.startAt : null,
        endAt: typeof o.endAt === 'string' && o.endAt ? o.endAt : null,
        order: num(o.order, 0),
      };
    })
    .filter((b): b is PromoBanner => b !== null)
    .sort((a, b) => a.order - b.order);
}

function readGames(raw: unknown): PwaGameConfig[] {
  const byKey = new Map<string, PwaGameConfig>();
  for (const key of DEFAULT_GAME_KEYS) byKey.set(key, { key, enabled: true, minOrderPaise: 0, pointsMultiplier: 1 });
  if (Array.isArray(raw)) {
    for (const g of raw) {
      const o = g as Record<string, unknown>;
      if (!o || typeof o.key !== 'string') continue;
      byKey.set(o.key, {
        key: o.key,
        enabled: bool(o.enabled, true),
        minOrderPaise: Math.max(0, num(o.minOrderPaise, 0)),
        pointsMultiplier: Math.max(0, num(o.pointsMultiplier, 1)),
      });
    }
  }
  return [...byKey.values()];
}

function readTiers(raw: unknown): PwaTierThreshold[] {
  if (!Array.isArray(raw)) return DEFAULT_TIERS;
  const byTier = new Map(DEFAULT_TIERS.map((t) => [t.tier, { ...t }]));
  for (const t of raw) {
    const o = t as Record<string, unknown>;
    if (!o || !TIER_KEYS.includes(o.tier as TierKey)) continue;
    const cur = byTier.get(o.tier as TierKey)!;
    byTier.set(o.tier as TierKey, {
      tier: o.tier as TierKey,
      displayName: str(o.displayName, cur.displayName),
      minSpendPaise: Math.max(0, num(o.minSpendPaise, cur.minSpendPaise)),
      minVisits: Math.max(0, num(o.minVisits, cur.minVisits)),
    });
  }
  return TIER_KEYS.map((k) => byTier.get(k)!);
}

/** Read & normalize the full PWA config from Outlet.settings.pwa. Never throws. */
export function readPwaConfig(settings: unknown): PwaConfig {
  const p = ((settings as { pwa?: unknown } | null)?.pwa ?? {}) as Record<string, unknown>;
  const reg = (p.registration ?? {}) as Record<string, unknown>;
  const gam = (p.gamification ?? {}) as Record<string, unknown>;
  const spin = (gam.spin ?? {}) as Record<string, unknown>;
  const wal = (p.wallet ?? {}) as Record<string, unknown>;
  const pts = (p.points ?? {}) as Record<string, unknown>;
  const tbl = (p.table ?? {}) as Record<string, unknown>;
  const thm = (p.theme ?? {}) as Record<string, unknown>;
  const home = (p.home ?? {}) as Record<string, unknown>;
  const avail = gam.availability as Record<string, unknown> | null | undefined;

  const sections = Array.isArray(home.sections)
    ? (home.sections.filter((s) => HOME_SECTIONS.includes(s as HomeSection)) as HomeSection[])
    : DEFAULT_PWA.home.sections;

  const weights = Array.isArray(spin.weights) && spin.weights.every((w) => Number.isFinite(Number(w)))
    ? spin.weights.map((w) => Number(w))
    : null;

  return {
    registration: { enabled: bool(reg.enabled, false), collectName: bool(reg.collectName, true) },
    featured: readFeatured(p.featured),
    banners: readBanners(p.banners),
    home: { sections: sections.length ? sections : DEFAULT_PWA.home.sections },
    gamification: {
      enabledGlobal: bool(gam.enabledGlobal, true),
      maxGamesPerDay: Math.max(0, num(gam.maxGamesPerDay, 0)),
      availability: avail && Number.isFinite(Number(avail.startHour)) && Number.isFinite(Number(avail.endHour))
        ? { startHour: clampHour(Number(avail.startHour)), endHour: clampHour(Number(avail.endHour)) }
        : null,
      games: readGames(gam.games),
      spin: { weights, pointsMultiplier: Math.max(0, num(spin.pointsMultiplier, 1)) },
    },
    wallet: {
      enabled: bool(wal.enabled, false),
      pointsPerRupee: Math.max(1, num(wal.pointsPerRupee, 10)),
      maxRedeemPctOfBill: Math.min(100, Math.max(0, num(wal.maxRedeemPctOfBill, 50))),
      minPointsToRedeem: Math.max(0, num(wal.minPointsToRedeem, 0)),
    },
    points: { earnRatePaisePerPoint: Math.max(1, num(pts.earnRatePaisePerPoint, 1000)) },
    loyalty: {
      tiers: readTiers((p.loyalty as Record<string, unknown> | undefined)?.tiers),
      rewards: (() => {
        const r = ((p.loyalty as Record<string, unknown> | undefined)?.rewards ?? {}) as Record<string, unknown>;
        return {
          firstOrderBonus: Math.max(0, num(r.firstOrderBonus, 0)),
          birthdayBonus: Math.max(0, num(r.birthdayBonus, 0)),
          referralBonus: Math.max(0, num(r.referralBonus, 0)),
        };
      })(),
    },
    table: { welcomePrefix: str(tbl.welcomePrefix, DEFAULT_PWA.table.welcomePrefix), allowManualPick: bool(tbl.allowManualPick, true) },
    theme: {
      accent: typeof thm.accent === 'string' && thm.accent ? thm.accent : null,
      logoUrl: typeof thm.logoUrl === 'string' && thm.logoUrl ? thm.logoUrl : null,
      heroTagline: str(thm.heroTagline),
    },
  };
}

const clampHour = (h: number) => Math.min(23, Math.max(0, Math.round(h)));

/** Load an outlet's PWA config (one query). Mirrors getOutletGst. Server-only. */
export async function getOutletPwa(outletId: string): Promise<PwaConfig> {
  const { prisma } = await import('@cafeos/db');
  const o = await prisma.outlet.findUnique({ where: { id: outletId }, select: { settings: true } });
  return readPwaConfig(o?.settings);
}

// ---- runtime helpers (shared by customer routes) ----

/** Display label for a stored Tier enum value (vip → "Platinum" by default). */
export function tierDisplayName(tier: string, cfg: PwaConfig): string {
  return cfg.loyalty.tiers.find((t) => t.tier === tier)?.displayName ?? tier;
}

/** Highest tier a customer currently qualifies for, by spend OR visits. */
export function tierForCustomer(spendPaise: number, visits: number, cfg: PwaConfig): PwaTierThreshold {
  const ordered = [...cfg.loyalty.tiers].sort((a, b) => a.minSpendPaise - b.minSpendPaise);
  let best = ordered[0]!;
  for (const t of ordered) if (spendPaise >= t.minSpendPaise || visits >= t.minVisits) best = t;
  return best;
}

/** ₹-paise value of N points under the wallet conversion rate. */
export function walletPointsToPaise(points: number, cfg: PwaConfig): number {
  return Math.floor((points / cfg.wallet.pointsPerRupee) * 100);
}
/** Points needed to cover N paise of discount (rounded up). */
export function paiseToPoints(paise: number, cfg: PwaConfig): number {
  return Math.ceil((paise / 100) * cfg.wallet.pointsPerRupee);
}

/** IST "now" pieces — IST is fixed UTC+5:30, no DST, so a constant offset is exact. */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
export function nowIstHour(now = Date.now()): number {
  return new Date(now + IST_OFFSET_MS).getUTCHours();
}
/** Start of the current IST calendar day, as a UTC Date (for day-cap queries). */
export function startOfTodayIST(now = Date.now()): Date {
  const ist = new Date(now + IST_OFFSET_MS);
  ist.setUTCHours(0, 0, 0, 0);
  return new Date(ist.getTime() - IST_OFFSET_MS);
}

/** Is a game currently playable given config (enabled + hours + min order)? */
export function gameUnlocked(cfg: PwaConfig, gameKey: string, orderTotalPaise: number, now = Date.now()): { ok: boolean; reason?: 'disabled' | 'hours' | 'min_order' } {
  if (!cfg.gamification.enabledGlobal) return { ok: false, reason: 'disabled' };
  const g = cfg.gamification.games.find((x) => x.key === gameKey);
  if (g && !g.enabled) return { ok: false, reason: 'disabled' };
  const av = cfg.gamification.availability;
  if (av) {
    const h = nowIstHour(now);
    const within = av.startHour <= av.endHour ? h >= av.startHour && h < av.endHour : h >= av.startHour || h < av.endHour;
    if (!within) return { ok: false, reason: 'hours' };
  }
  if (g && g.minOrderPaise > 0 && orderTotalPaise < g.minOrderPaise) return { ok: false, reason: 'min_order' };
  return { ok: true };
}
