import { prisma } from '@cafeos/db';

/**
 * ChayaOne — tenant billing state (Phase G7). A tenant is "blocked" (read-only
 * billing wall) when it is suspended or its subscription has lapsed. Status is
 * managed manually by the super-admin in this phase (Razorpay automation later).
 * Cached briefly so the hot path doesn't hit the DB every request.
 */
const TTL_MS = 15_000;
const cache = new Map<string, { blocked: boolean; reason: string | null; at: number }>();

export async function tenantBilling(tenantId: string): Promise<{ blocked: boolean; reason: string | null }> {
  const hit = cache.get(tenantId);
  if (hit && Date.now() - hit.at < TTL_MS) return { blocked: hit.blocked, reason: hit.reason };

  const t = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { status: true, subscription: { select: { status: true } } },
  });
  const subStatus = t?.subscription?.status ?? null;
  const blocked =
    t?.status === 'suspended' || subStatus === 'suspended' || subStatus === 'expired' || subStatus === 'cancelled';
  const reason = blocked ? subStatus ?? t?.status ?? 'suspended' : null;

  cache.set(tenantId, { blocked, reason, at: Date.now() });
  return { blocked, reason };
}
