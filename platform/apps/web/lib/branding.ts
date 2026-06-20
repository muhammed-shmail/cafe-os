import { prisma } from '@cafeos/db';

/**
 * ChayaOne — per-tenant white-label branding (Phase G9). Enterprise tenants can
 * override logo / colors / app name and hide the "Powered by ChayaOne" mark.
 * Everyone else falls back to ChayaOne defaults.
 */
export type Branding = {
  appName: string;
  logoUrl: string | null;
  faviconUrl: string | null;
  colors: Record<string, string>;
  poweredBy: boolean;
};

const DEFAULTS: Branding = { appName: 'ChayaOne', logoUrl: '/logo chaya one.png', faviconUrl: '/fib icon.jpg', colors: {}, poweredBy: true };

export async function getTenantBranding(tenantId: string): Promise<Branding> {
  const b = await prisma.tenantBranding.findUnique({ where: { tenantId } });
  if (!b) return DEFAULTS;
  return {
    appName: b.appName ?? DEFAULTS.appName,
    logoUrl: b.logoUrl,
    faviconUrl: b.faviconUrl,
    colors: (b.colors ?? {}) as Record<string, string>,
    poweredBy: b.poweredBy,
  };
}
