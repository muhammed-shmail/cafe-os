import { NextResponse } from 'next/server';
import { prisma } from '@cafeos/db';
import { getPlatformSession } from '@/lib/platform-session';
import { platformCan } from '@/lib/platform-rbac';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/admin/audit — recent control-plane actions. */
export async function GET() {
  const s = await getPlatformSession();
  if (!s) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!platformCan(s.role, 'audit.read')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const audit = await prisma.platformAudit.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { admin: { select: { name: true, email: true } } },
  });
  return NextResponse.json({ audit });
}
