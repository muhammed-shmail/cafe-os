import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@cafeos/db';
import { getPlatformSession } from '@/lib/platform-session';
import { platformCan } from '@/lib/platform-rbac';
import { platformAudit } from '@/lib/platform-audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/admin/tickets — support queue across all tenants. */
export async function GET() {
  const s = await getPlatformSession();
  if (!s) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!platformCan(s.role, 'tickets.write')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const tickets = await prisma.supportTicket.findMany({
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: 100,
    include: { tenant: { select: { name: true, subdomain: true } }, _count: { select: { messages: true } } },
  });
  return NextResponse.json({ tickets });
}

const Patch = z.object({
  id: z.string().uuid(),
  status: z.enum(['open', 'in_progress', 'waiting', 'resolved', 'closed']),
});

/** PATCH /api/admin/tickets — triage a ticket's status. */
export async function PATCH(req: NextRequest) {
  const s = await getPlatformSession();
  if (!s) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!platformCan(s.role, 'tickets.write')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const parsed = Patch.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input' }, { status: 400 });

  const t = await prisma.supportTicket.update({
    where: { id: parsed.data.id },
    data: { status: parsed.data.status, assignedTo: s.adminId },
  });
  await platformAudit({ adminId: s.adminId, action: 'ticket.update', targetTenantId: t.tenantId, meta: { id: t.id, status: t.status } });
  return NextResponse.json({ ok: true, ticket: t });
}
