import { NextRequest, NextResponse } from 'next/server';
import { getPlatformSession } from '@/lib/platform-session';
import { platformCan } from '@/lib/platform-rbac';
import { platformAudit } from '@/lib/platform-audit';
import { getTenantDetail, deleteTenant } from '@/lib/platform-tenants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/admin/tenants/[id] — full detail for the tenant page. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getPlatformSession();
  if (!s) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!platformCan(s.role, 'tenants.read')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const tenant = await getTenantDetail(params.id);
  if (!tenant) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ tenant });
}

/** DELETE /api/admin/tenants/[id] — hard delete (cascade). */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getPlatformSession();
  if (!s) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!platformCan(s.role, 'tenants.lifecycle')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  await deleteTenant(params.id);
  await platformAudit({ adminId: s.adminId, action: 'tenant.delete', targetTenantId: params.id, ip: req.headers.get('x-forwarded-for') });
  return NextResponse.json({ ok: true });
}
