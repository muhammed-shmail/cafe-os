import { prisma } from '@cafeos/db';

/**
 * ChayaOne — plan feature flags (Phase G9). Features live on the tenant's plan
 * (`PlanDefinition.features`), e.g. { whatsapp, ai_assistant, white_label }.
 * Cached briefly so gates are cheap on the hot path.
 */
const TTL_MS = 30_000;
const cache = new Map<string, { features: Record<string, boolean>; at: number }>();

export async function tenantFeatures(tenantId: string): Promise<Record<string, boolean>> {
  const hit = cache.get(tenantId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.features;
  const sub = await prisma.subscription.findUnique({ where: { tenantId }, select: { plan: { select: { features: true } } } });
  const features = (sub?.plan.features ?? {}) as Record<string, boolean>;
  cache.set(tenantId, { features, at: Date.now() });
  return features;
}

export async function tenantHasFeature(tenantId: string, flag: string): Promise<boolean> {
  return !!(await tenantFeatures(tenantId))[flag];
}
