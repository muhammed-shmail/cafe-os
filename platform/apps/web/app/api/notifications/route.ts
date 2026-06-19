import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@cafeos/db';
import { getSession } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/notifications?unread=1 — the owner alert feed for this outlet. */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const onlyUnread = req.nextUrl.searchParams.get('unread') === '1';
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { outletId: session.outletId, ...(onlyUnread ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 40,
    }),
    prisma.notification.count({ where: { outletId: session.outletId, readAt: null } }),
  ]);

  return NextResponse.json({
    unread,
    items: items.map((n) => ({
      id: n.id,
      type: n.type,
      severity: n.severity,
      title: n.title,
      body: n.body,
      entity: n.entity,
      readAt: n.readAt ? n.readAt.toISOString() : null,
      at: n.createdAt.toISOString(),
    })),
  });
}

/** POST /api/notifications — { action: 'read', id } | { action: 'read_all' }. */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { action, id } = await req.json().catch(() => ({}));

  if (action === 'read' && id) {
    await prisma.notification.updateMany({
      where: { id, outletId: session.outletId, readAt: null },
      data: { readAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  }
  if (action === 'read_all') {
    await prisma.notification.updateMany({
      where: { outletId: session.outletId, readAt: null },
      data: { readAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
}
