import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { listAuditLogs, getAuditFilterOptions } from '@/lib/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/dashboard/audit — owner-only audit trail for Settings → Audit Logs.
 *
 * Read-only view over the append-only `AuditLog` ledger, scoped to the session's
 * outlet. Owner-only (managers are forbidden) because the log exposes every
 * staff member's activity. Supports action/entity/actor filters + page paging;
 * the first page also returns `filterOptions` to populate the filter dropdowns.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (session.role !== 'owner') return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const action = sp.get('action');
  const entity = sp.get('entity');
  const actorId = sp.get('actorId');
  const page = Math.max(1, Number(sp.get('page') ?? '1') || 1);

  const list = await listAuditLogs(session.outletId, { action, entity, actorId, page });
  const filterOptions = page === 1 ? await getAuditFilterOptions(session.outletId, session.tenantId) : undefined;
  return NextResponse.json({ ...list, ...(filterOptions ? { filterOptions } : {}) });
}
