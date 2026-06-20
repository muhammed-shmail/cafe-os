import { prisma } from '@cafeos/db';

/**
 * ChayaOne — runtime tenant resolution (Phase G2).
 *
 * Public / PWA traffic carries no staff session, so the tenant comes from the
 * request host: `kaava.chayaone.com` → subdomain "kaava" → `Tenant.subdomain`.
 * Staff traffic resolves from the signed session instead (see `lib/context.ts`).
 *
 * Local dev has no subdomains, so set `DEV_TENANT_SUBDOMAIN` in `.env` to force a
 * tenant for `localhost`. Resolution is cached in-process (60s) since it sits on
 * the per-request hot path. Runs in the Node runtime only (uses Prisma) — never
 * called from edge middleware.
 */
const TTL_MS = 60_000;
const cache = new Map<string, { id: string | null; at: number }>();

/** Extract a tenant subdomain from a Host header (null if none / reserved). */
export function subdomainFromHost(host: string | null | undefined): string | null {
  if (!host) return null;
  const h = (host.split(':')[0] ?? '').toLowerCase().trim();
  if (!h || h === 'localhost' || /^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return null;
  const parts = h.split('.');
  if (parts.length < 3) return null; // need sub.base.tld, e.g. kaava.chayaone.com
  const sub = parts[0];
  // reserved hosts that are never a tenant
  if (!sub || sub === 'www' || sub === 'app' || sub === 'admin' || sub === 'api') return null;
  return sub;
}

/**
 * Resolve a tenant id from the request host:
 *   1. subdomain → Tenant.subdomain  (kaava.chayaone.com)
 *   2. full host → TenantBranding.customDomain  (Enterprise white-label, brewlab.com)
 *   3. DEV_TENANT_SUBDOMAIN fallback for local dev
 * Returns null when none match. Results (incl. misses) are cached by host.
 */
export async function resolveTenantIdFromHost(host: string | null | undefined): Promise<string | null> {
  const key = `${host ?? ''}|${process.env.DEV_TENANT_SUBDOMAIN ?? ''}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.id;
  const id = await lookupTenantId(host);
  cache.set(key, { id, at: Date.now() });
  return id;
}

async function lookupTenantId(host: string | null | undefined): Promise<string | null> {
  const sub = subdomainFromHost(host);
  if (sub) {
    const t = await prisma.tenant.findUnique({ where: { subdomain: sub }, select: { id: true } });
    if (t) return t.id;
  }
  // Custom domain (no usable subdomain, but a real apex/host like brewlab.com)
  const h = (host?.split(':')[0] ?? '').toLowerCase().trim();
  if (h && h !== 'localhost' && h.includes('.') && !/^\d/.test(h)) {
    const b = await prisma.tenantBranding.findUnique({ where: { customDomain: h }, select: { tenantId: true } });
    if (b) return b.tenantId;
  }
  // Local dev fallback
  const dev = process.env.DEV_TENANT_SUBDOMAIN;
  if (dev) {
    const t = await prisma.tenant.findUnique({ where: { subdomain: dev }, select: { id: true } });
    if (t) return t.id;
  }
  return null;
}
