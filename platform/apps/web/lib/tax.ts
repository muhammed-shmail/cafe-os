import { prisma } from '@cafeos/db';

/**
 * Per-outlet GST configuration, stored in `Outlet.settings.gst`.
 *
 *   enabled       — does this shop charge GST at all? Unregistered shops set
 *                   this false and every bill comes out tax-free.
 *   rateOverride  — a single flat rate (percent) billed on every line instead
 *                   of each item's own gstRate; null ⇒ use per-item rates.
 *   inclusive     — true ⇒ menu prices already contain GST (extracted out on
 *                   the bill); false ⇒ GST is added on top of the price.
 *
 * Default is `enabled: false` (GST OFF until an outlet opts in), `rateOverride:
 * null`, `inclusive: false`. An outlet turns GST on from Settings → Tax & GST.
 */
export type GstType = 'exclusive' | 'inclusive';
export type GstConfig = { enabled: boolean; rateOverride: number | null; inclusive: boolean; type: GstType };

export function readGstConfig(settings: unknown): GstConfig {
  const s = (settings ?? {}) as Record<string, unknown>;
  const g = (s.gst ?? {}) as Record<string, unknown>;
  const enabled = g.enabled === undefined ? false : !!g.enabled;
  const rate = Number(g.rate);
  const rateOverride = enabled && Number.isFinite(rate) && rate > 0 ? Math.min(28, rate) : null;
  const inclusive = g.type === 'inclusive';
  return { enabled, rateOverride, inclusive, type: inclusive ? 'inclusive' : 'exclusive' };
}

/** Load an outlet's GST config (one small query). */
export async function getOutletGst(outletId: string): Promise<GstConfig> {
  const o = await prisma.outlet.findUnique({ where: { id: outletId }, select: { settings: true } });
  return readGstConfig(o?.settings);
}

/** Spread-ready billing options for computeBill(). */
export function gstBillOptions(cfg: GstConfig): { gstEnabled: boolean; gstRateOverride: number | null; gstInclusive: boolean } {
  return { gstEnabled: cfg.enabled, gstRateOverride: cfg.rateOverride, gstInclusive: cfg.inclusive };
}
