import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@cafeos/db';
import { getPlatformSession } from '@/lib/platform-session';
import { platformCan } from '@/lib/platform-rbac';
import { platformAudit } from '@/lib/platform-audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  // per-tenant slot grants on top of the plan; null = unlimited for that metric
  slotOverrides: z.record(z.union([z.number().int().min(0), z.null()])),
});

/** PATCH /api/admin/tenants/[id]/slots — set per-tenant slot overrides. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const s = await getPlatformSession();
  if (!s) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!platformCan(s.role, 'subscription.write')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input' }, { status: 400 });

  const updated = await prisma.subscription.updateMany({
    where: { tenantId: params.id },
    data: { slotOverrides: parsed.data.slotOverrides },
  });
  if (updated.count === 0) return NextResponse.json({ error: 'no_subscription' }, { status: 404 });

  await platformAudit({ adminId: s.adminId, action: 'slot.grant', targetTenantId: params.id, meta: parsed.data.slotOverrides });
  return NextResponse.json({ ok: true });
}
