import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@cafeos/db';
import { getSession } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/support — the cafe's own support tickets (owner/manager). */
export async function GET() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const tickets = await prisma.supportTicket.findMany({
    where: { tenantId: s.tenantId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { id: true, subject: true, status: true, priority: true, createdAt: true },
  });
  return NextResponse.json({ tickets });
}

const Body = z.object({
  subject: z.string().min(1).max(140),
  body: z.string().min(1).max(2000),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
});

/** POST /api/support — raise a ticket to Nuro7. */
export async function POST(req: NextRequest) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (s.role !== 'owner' && s.role !== 'manager') return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input' }, { status: 400 });

  const ticket = await prisma.supportTicket.create({
    data: {
      tenantId: s.tenantId,
      subject: parsed.data.subject,
      body: parsed.data.body,
      priority: parsed.data.priority ?? 'normal',
      createdBy: s.staffId,
      messages: { create: { authorKind: 'tenant', authorId: s.staffId, body: parsed.data.body } },
    },
    select: { id: true, subject: true, status: true },
  });
  return NextResponse.json({ ok: true, ticket });
}
