import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@cafeos/db';
import { getSession } from '@/lib/auth';
import { canManageStaff } from '@/lib/rbac';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Manual attendance punch (the chosen clock-in method).
 *
 * GET  /api/attendance            → the caller's current open punch (or null),
 *                                    so the POS/KDS button knows its state.
 * POST /api/attendance { action: 'in' | 'out', staffId? }
 *   - subject defaults to the signed-in staff (self-punch, any role).
 *   - owner/manager may pass `staffId` to punch someone else (dashboard override).
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const open = await prisma.attendance.findFirst({
    where: { outletId: session.outletId, staffId: session.staffId, clockOut: null },
    orderBy: { clockIn: 'desc' },
    select: { id: true, clockIn: true },
  });
  return NextResponse.json({ open: open ? { id: open.id, clockIn: open.clockIn.toISOString() } : null });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const action = body.action;
  if (action !== 'in' && action !== 'out') return NextResponse.json({ error: 'invalid_action' }, { status: 400 });

  // who is being punched — self by default; punching others needs manage rights
  let staffId = session.staffId;
  if (body.staffId && body.staffId !== session.staffId) {
    if (!canManageStaff(session.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    const t = await prisma.staffUser.findFirst({ where: { id: body.staffId, tenantId: session.tenantId }, select: { id: true } });
    if (!t) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    staffId = body.staffId;
  }

  const open = await prisma.attendance.findFirst({
    where: { outletId: session.outletId, staffId, clockOut: null },
    orderBy: { clockIn: 'desc' },
  });

  if (action === 'in') {
    if (open) return NextResponse.json({ ok: true, open: { id: open.id, clockIn: open.clockIn.toISOString() }, already: true });
    const rec = await prisma.attendance.create({
      data: { outletId: session.outletId, staffId, clockIn: new Date(), source: 'punch' },
      select: { id: true, clockIn: true },
    });
    return NextResponse.json({ ok: true, open: { id: rec.id, clockIn: rec.clockIn.toISOString() } });
  }

  // action === 'out'
  if (!open) return NextResponse.json({ ok: true, open: null, already: true });
  await prisma.attendance.update({ where: { id: open.id }, data: { clockOut: new Date() } });
  return NextResponse.json({ ok: true, open: null });
}
