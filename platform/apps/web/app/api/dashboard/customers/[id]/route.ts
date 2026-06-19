import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getCustomerProfile, getCustomerTimeline } from '@/lib/crm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/dashboard/customers/[id] — full profile + activity timeline. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (session.role !== 'owner' && session.role !== 'manager')
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const [profile, timeline] = await Promise.all([
    getCustomerProfile(session.tenantId, session.outletId, params.id),
    getCustomerTimeline(session.tenantId, params.id),
  ]);
  if (!profile) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ profile, timeline });
}
