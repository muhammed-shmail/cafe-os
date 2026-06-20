import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@cafeos/db';
import { getPlatformSession } from '@/lib/platform-session';
import { platformCan } from '@/lib/platform-rbac';
import { platformAudit } from '@/lib/platform-audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  appName: z.string().max(40).nullish(),
  logoUrl: z.string().max(400).nullish(),
  faviconUrl: z.string().max(400).nullish(),
  customDomain: z.string().max(120).nullish(),
  colors: z.record(z.string()).optional(),
  poweredBy: z.boolean().optional(),
});

/** PUT /api/admin/tenants/[id]/branding — set white-label branding (Enterprise). */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getPlatformSession();
  if (!s) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!platformCan(s.role, 'tenants.lifecycle')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  const d = parsed.data;
  const customDomain = d.customDomain ? d.customDomain.toLowerCase().trim() : null;

  const data = {
    appName: d.appName ?? null,
    logoUrl: d.logoUrl ?? null,
    faviconUrl: d.faviconUrl ?? null,
    customDomain,
    ...(d.colors ? { colors: d.colors } : {}),
    ...(d.poweredBy !== undefined ? { poweredBy: d.poweredBy } : {}),
  };

  try {
    const branding = await prisma.tenantBranding.upsert({
      where: { tenantId: params.id },
      create: { tenantId: params.id, ...data },
      update: data,
    });
    await platformAudit({ adminId: s.adminId, action: 'tenant.branding', targetTenantId: params.id, meta: { customDomain } });
    return NextResponse.json({ ok: true, branding });
  } catch {
    // unique violation on customDomain
    return NextResponse.json({ error: 'domain_taken' }, { status: 409 });
  }
}
