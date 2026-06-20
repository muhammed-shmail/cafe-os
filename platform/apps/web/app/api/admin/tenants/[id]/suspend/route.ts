import { NextRequest, NextResponse } from 'next/server';
import { getPlatformSession } from '@/lib/platform-session';
import { platformCan } from '@/lib/platform-rbac';
import { platformAudit } from '@/lib/platform-audit';
import { setTenantStatus } from '@/lib/platform-tenants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/admin/tenants/[id]/suspend — freeze a tenant (data preserved; billing wall in G7). */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getPlatformSession();
  if (!s) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!platformCan(s.role, 'tenants.lifecycle')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  await setTenantStatus(params.id, 'suspended');
  await platformAudit({ adminId: s.adminId, action: 'tenant.suspend', targetTenantId: params.id, ip: req.headers.get('x-forwarded-for') });
  return NextResponse.json({ ok: true });
}
