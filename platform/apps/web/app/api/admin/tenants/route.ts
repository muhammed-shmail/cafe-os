import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getPlatformSession } from '@/lib/platform-session';
import { platformCan } from '@/lib/platform-rbac';
import { platformAudit } from '@/lib/platform-audit';
import { createTenant, listTenants } from '@/lib/platform-tenants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/admin/tenants — list all tenants for the console. */
export async function GET() {
  const s = await getPlatformSession();
  if (!s) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!platformCan(s.role, 'tenants.read')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  return NextResponse.json({ tenants: await listTenants() });
}

const CreateBody = z.object({
  name: z.string().min(1).max(80),
  subdomain: z.string().regex(/^[a-z0-9-]{2,40}$/),
  planKey: z.enum(['starter', 'growth', 'pro', 'enterprise']),
  ownerName: z.string().min(1).max(80),
  ownerPhone: z.string().max(20).optional(),
  outletName: z.string().max(80).optional(),
  stateCode: z.string().max(2).optional(),
});

/** POST /api/admin/tenants — provision a new cafe (workflow §7). Returns the temp owner PIN once. */
export async function POST(req: NextRequest) {
  const s = await getPlatformSession();
  if (!s) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!platformCan(s.role, 'tenants.lifecycle')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const parsed = CreateBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input', detail: parsed.error.flatten() }, { status: 400 });

  try {
    const { tenantId, ownerPin } = await createTenant(parsed.data);
    await platformAudit({
      adminId: s.adminId,
      action: 'tenant.create',
      targetTenantId: tenantId,
      meta: { subdomain: parsed.data.subdomain, plan: parsed.data.planKey },
      ip: req.headers.get('x-forwarded-for'),
    });
    return NextResponse.json({ ok: true, tenantId, ownerPin });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'create_failed';
    const status = msg === 'subdomain_taken' || msg === 'invalid_subdomain' ? 409 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
