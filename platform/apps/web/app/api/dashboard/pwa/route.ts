import { NextRequest, NextResponse } from 'next/server';
import { prisma, type Prisma } from '@cafeos/db';
import { getSession } from '@/lib/auth';
import { readPwaConfig, FEATURED_LABELS, type FeaturedLabel } from '@/lib/pwa';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/dashboard/pwa — manage the customer PWA config stored in
 * Outlet.settings.pwa (featured dishes, banners, gamification, wallet, loyalty,
 * registration, table, theme, home layout). Owner/manager only. Each action
 * deep-merges ONE sub-block, mirroring the /api/dashboard/floor pattern; nothing
 * outside `settings.pwa` is touched, so existing config stays intact.
 */

async function readSettings(outletId: string) {
  const o = await prisma.outlet.findUnique({ where: { id: outletId }, select: { settings: true } });
  return (o?.settings as Record<string, unknown>) ?? {};
}

const LABELS = FEATURED_LABELS.map((l) => l.value);
const num = (v: unknown, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const isUrl = (v: unknown) => typeof v === 'string' && /^(https?:\/\/|\/)/.test(v.trim());

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (session.role !== 'owner' && session.role !== 'manager') return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const outletId = session.outletId;
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? '');

  const settings = await readSettings(outletId);
  const pwa = (settings.pwa as Record<string, unknown>) ?? {};
  // start from the normalized config so a partial save never drops sibling blocks
  const cfg = readPwaConfig(settings);
  let patch: Record<string, unknown> | null = null;

  switch (action) {
    case 'registration_save':
      patch = { registration: { enabled: !!body.enabled, collectName: body.collectName !== false } };
      break;

    case 'home_save': {
      const sections = Array.isArray(body.sections) ? body.sections.filter((s: unknown) => ['banners', 'featured', 'track', 'loyalty'].includes(s as string)) : cfg.home.sections;
      patch = { home: { sections } };
      break;
    }

    case 'theme_save':
      patch = { theme: { accent: body.accent ? String(body.accent) : null, logoUrl: isUrl(body.logoUrl) ? String(body.logoUrl).trim() : null, heroTagline: String(body.heroTagline ?? '').slice(0, 140) } };
      break;

    case 'table_save':
      patch = { table: { welcomePrefix: String(body.welcomePrefix ?? 'Welcome to Table').slice(0, 40), allowManualPick: body.allowManualPick !== false } };
      break;

    case 'points_save':
      patch = { points: { earnRatePaisePerPoint: Math.max(1, Math.round(num(body.earnRatePaisePerPoint, 1000))) } };
      break;

    case 'wallet_save':
      patch = {
        wallet: {
          enabled: !!body.enabled,
          pointsPerRupee: Math.max(1, Math.round(num(body.pointsPerRupee, 10))),
          maxRedeemPctOfBill: Math.min(100, Math.max(0, Math.round(num(body.maxRedeemPctOfBill, 50)))),
          minPointsToRedeem: Math.max(0, Math.round(num(body.minPointsToRedeem, 0))),
        },
      };
      break;

    case 'gamification_save': {
      const games = Array.isArray(body.games)
        ? body.games.map((g: Record<string, unknown>) => ({
            key: String(g.key),
            enabled: g.enabled !== false,
            minOrderPaise: Math.max(0, Math.round(num(g.minOrderPaise, 0))),
            pointsMultiplier: Math.max(0, num(g.pointsMultiplier, 1)),
          }))
        : cfg.gamification.games;
      const av = body.availability;
      const availability = av && Number.isFinite(Number(av.startHour)) && Number.isFinite(Number(av.endHour))
        ? { startHour: Math.min(23, Math.max(0, Math.round(Number(av.startHour)))), endHour: Math.min(23, Math.max(0, Math.round(Number(av.endHour)))) }
        : null;
      const weights = Array.isArray(body.spin?.weights) && body.spin.weights.length ? body.spin.weights.map((w: unknown) => Math.max(0, num(w, 0))) : null;
      patch = {
        gamification: {
          enabledGlobal: body.enabledGlobal !== false,
          maxGamesPerDay: Math.max(0, Math.round(num(body.maxGamesPerDay, 0))),
          availability,
          games,
          spin: { weights, pointsMultiplier: Math.max(0, num(body.spin?.pointsMultiplier, 1)) },
        },
      };
      break;
    }

    case 'loyalty_save': {
      const tiers = Array.isArray(body.tiers)
        ? body.tiers
            .filter((t: Record<string, unknown>) => ['bronze', 'silver', 'gold', 'vip'].includes(t.tier as string))
            .map((t: Record<string, unknown>) => ({ tier: t.tier, displayName: String(t.displayName ?? t.tier).slice(0, 24), minSpendPaise: Math.max(0, Math.round(num(t.minSpendPaise, 0))), minVisits: Math.max(0, Math.round(num(t.minVisits, 0))) }))
        : cfg.loyalty.tiers;
      // optional bonus-point rules (CRM Loyalty Settings); fall back to current values
      const r = (body.rewards ?? {}) as Record<string, unknown>;
      const rewards = body.rewards
        ? {
            firstOrderBonus: Math.max(0, Math.round(num(r.firstOrderBonus, cfg.loyalty.rewards.firstOrderBonus))),
            birthdayBonus: Math.max(0, Math.round(num(r.birthdayBonus, cfg.loyalty.rewards.birthdayBonus))),
            referralBonus: Math.max(0, Math.round(num(r.referralBonus, cfg.loyalty.rewards.referralBonus))),
          }
        : cfg.loyalty.rewards;
      patch = { loyalty: { tiers, rewards } };
      break;
    }

    // ---- featured dishes (array) ----
    case 'featured_save': {
      const d = body.dish ?? {};
      if (typeof d.itemId !== 'string' || !d.itemId) return NextResponse.json({ error: 'missing_item' }, { status: 400 });
      const owned = await prisma.menuItem.findFirst({ where: { id: d.itemId, outletId }, select: { id: true } });
      if (!owned) return NextResponse.json({ error: 'item_not_found' }, { status: 404 });
      const label = LABELS.includes(d.label as FeaturedLabel) ? (d.label as FeaturedLabel) : null;
      const entry = { itemId: d.itemId, label, priority: Math.round(num(d.priority, cfg.featured.length)), imageUrl: isUrl(d.imageUrl) ? String(d.imageUrl).trim() : null };
      const next = cfg.featured.filter((f) => f.itemId !== d.itemId);
      next.push(entry);
      patch = { featured: next };
      break;
    }
    case 'featured_delete':
      patch = { featured: cfg.featured.filter((f) => f.itemId !== body.itemId) };
      break;

    // ---- promotional banners (array) ----
    case 'banner_save': {
      const b = body.banner ?? {};
      if (!isUrl(b.imageUrl)) return NextResponse.json({ error: 'missing_image' }, { status: 400 });
      const id = typeof b.id === 'string' && b.id ? b.id : crypto.randomUUID();
      const entry = {
        id,
        imageUrl: String(b.imageUrl).trim(),
        title: String(b.title ?? '').slice(0, 80),
        link: isUrl(b.link) ? String(b.link).trim() : null,
        startAt: b.startAt ? String(b.startAt) : null,
        endAt: b.endAt ? String(b.endAt) : null,
        order: Math.round(num(b.order, cfg.banners.length)),
      };
      const next = cfg.banners.filter((x) => x.id !== id);
      next.push(entry);
      patch = { banners: next.sort((x, y) => x.order - y.order) };
      break;
    }
    case 'banner_delete':
      patch = { banners: cfg.banners.filter((x) => x.id !== body.id) };
      break;

    default:
      return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
  }

  const nextPwa = { ...pwa, ...patch };
  await prisma.outlet.update({ where: { id: outletId }, data: { settings: { ...settings, pwa: nextPwa } as Prisma.InputJsonValue } });
  await prisma.auditLog.create({
    data: { outletId, actorId: session.staffId, action: `pwa.${action}`, entity: 'pwa', entityId: null, after: (patch ?? {}) as Prisma.InputJsonValue },
  }).catch(() => {});

  // return the freshly normalized config so the client stays in sync
  return NextResponse.json({ ok: true, config: readPwaConfig({ ...settings, pwa: nextPwa }) });
}
