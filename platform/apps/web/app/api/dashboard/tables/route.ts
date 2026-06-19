import { NextRequest, NextResponse } from 'next/server';
import { prisma, type Prisma } from '@cafeos/db';
import { getSession } from '@/lib/auth';
import { DEFAULT_OCCUPANCY } from '@/lib/occupancy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/dashboard/tables — update the low-revenue-occupancy thresholds.
 * Stored (merged) in Outlet.settings.occupancy, so no schema change is needed.
 * Owner/manager only.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (session.role !== 'owner' && session.role !== 'manager') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  if (body.action !== 'config') return NextResponse.json({ error: 'invalid_action' }, { status: 400 });

  const minutes = Number(body.minutes);
  const minBillPaise = Number(body.minBillPaise);
  const occupancy = {
    minutes: Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : DEFAULT_OCCUPANCY.minutes,
    minBillPaise: Number.isFinite(minBillPaise) && minBillPaise >= 0 ? Math.round(minBillPaise) : DEFAULT_OCCUPANCY.minBillPaise,
  };

  const outlet = await prisma.outlet.findUnique({ where: { id: session.outletId }, select: { settings: true } });
  const merged = { ...((outlet?.settings as Record<string, unknown>) ?? {}), occupancy };

  await prisma.outlet.update({ where: { id: session.outletId }, data: { settings: merged as Prisma.InputJsonValue } });
  return NextResponse.json({ ok: true, occupancy });
}
