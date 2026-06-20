import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@cafeos/db';
import { getPlatformSession } from '@/lib/platform-session';
import { platformCan } from '@/lib/platform-rbac';
import { platformAudit } from '@/lib/platform-audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/admin/announcements — list broadcasts. */
export async function GET() {
  const s = await getPlatformSession();
  if (!s) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!platformCan(s.role, 'analytics.read')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const announcements = await prisma.announcement.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  return NextResponse.json({ announcements });
}

const Body = z.object({
  title: z.string().min(1).max(140),
  body: z.string().min(1).max(2000),
  audience: z.string().max(60).optional(), // all | plan:pro | tenant:<id>
  publish: z.boolean().optional(),
});

/** POST /api/admin/announcements — create (optionally publish) a broadcast. */
export async function POST(req: NextRequest) {
  const s = await getPlatformSession();
  if (!s) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!platformCan(s.role, 'announcements.write')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_input' }, { status: 400 });

  const a = await prisma.announcement.create({
    data: {
      title: parsed.data.title,
      body: parsed.data.body,
      audience: parsed.data.audience || 'all',
      publishedAt: parsed.data.publish ? new Date() : null,
    },
  });
  await platformAudit({ adminId: s.adminId, action: 'announcement.create', meta: { id: a.id, audience: a.audience } });
  return NextResponse.json({ ok: true, announcement: a });
}
