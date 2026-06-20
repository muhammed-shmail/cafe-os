import { NextResponse } from 'next/server';
import { getPlatformSession } from '@/lib/platform-session';
import { platformCan } from '@/lib/platform-rbac';
import { platformStats } from '@/lib/platform-analytics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/admin/analytics/platform — cross-tenant KPIs (MRR/ARR/growth). */
export async function GET() {
  const s = await getPlatformSession();
  if (!s) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!platformCan(s.role, 'analytics.read')) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  return NextResponse.json(await platformStats());
}
