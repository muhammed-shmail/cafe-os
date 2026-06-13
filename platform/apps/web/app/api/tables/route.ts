import { NextResponse } from 'next/server';
import { prisma } from '@cafeos/db';
import { getActiveOutlet } from '@/lib/context';

export const dynamic = 'force-dynamic';

/** GET /api/tables — floor map for the active outlet. */
export async function GET() {
  const outlet = await getActiveOutlet();
  const tables = await prisma.tableMap.findMany({
    where: { outletId: outlet.id },
    orderBy: { label: 'asc' },
    select: { id: true, label: true, seats: true, state: true },
  });
  return NextResponse.json({ tables });
}
