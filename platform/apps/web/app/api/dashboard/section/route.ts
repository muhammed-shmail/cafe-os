import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getSectionData, type SectionName } from '@/lib/sections';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SECTIONS: SectionName[] = ['monitor', 'sales', 'inventory', 'suppliers', 'tables', 'staff', 'loyalty', 'marketing', 'menu', 'settings', 'pwa'];

/**
 * GET /api/dashboard/section?s=<name> — deep-section data for the Owner Dashboard.
 *
 * Owner/manager only, scoped to the session's outlet + tenant. The client loads
 * this lazily when a sidebar section is opened so the Overview paints instantly.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (session.role !== 'owner' && session.role !== 'manager')
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const s = req.nextUrl.searchParams.get('s') as SectionName | null;
  if (!s || !SECTIONS.includes(s)) return NextResponse.json({ error: 'unknown section' }, { status: 400 });

  const result = await getSectionData(s, session.outletId, session.tenantId);
  return NextResponse.json(result);
}
