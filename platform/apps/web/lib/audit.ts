import { prisma, type Prisma } from '@cafeos/db';

/**
 * Cafe OS — Audit log read layer (server-only).
 *
 * A read-and-surface layer over the append-only `AuditLog` ledger that is
 * already written by the mutation routes (approvals, staff, customers, settings,
 * floor, pwa, table orders, qr-order). Nothing here mutates the ledger.
 *
 * Scoped to a single outlet. Surfaced owner-only in Settings → Audit Logs.
 */

export const AUDIT_PAGE_SIZE = 50;

export interface AuditEntry {
  id: string;
  at: string;
  actorName: string;
  action: string;
  entity: string;
  entityId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

export interface AuditListResult {
  entries: AuditEntry[];
  hasMore: boolean;
  page: number;
}

export interface AuditFilters {
  action?: string | null;
  entity?: string | null;
  actorId?: string | null;
  page?: number;
}

export interface AuditFilterOptions {
  actions: string[];
  entities: string[];
  staff: { id: string; name: string }[];
}

const asObj = (v: Prisma.JsonValue | null): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

/** Latest-first, outlet-scoped audit entries with optional filters and paging. */
export async function listAuditLogs(
  outletId: string,
  { action, entity, actorId, page = 1 }: AuditFilters,
  pageSize = AUDIT_PAGE_SIZE,
): Promise<AuditListResult> {
  const where: Prisma.AuditLogWhereInput = {
    outletId,
    ...(action ? { action } : {}),
    ...(entity ? { entity } : {}),
    ...(actorId ? { actorId } : {}),
  };
  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { actor: { select: { name: true } } },
    skip: (page - 1) * pageSize,
    take: pageSize + 1, // one extra row to detect "hasMore"
  });
  const hasMore = rows.length > pageSize;
  const entries: AuditEntry[] = rows.slice(0, pageSize).map((r) => ({
    id: r.id,
    at: r.createdAt.toISOString(),
    actorName: r.actor?.name ?? 'System',
    action: r.action,
    entity: r.entity,
    entityId: r.entityId,
    before: asObj(r.before),
    after: asObj(r.after),
  }));
  return { entries, hasMore, page };
}

/** Distinct actions/entities (this outlet) + tenant staff, to populate filter dropdowns. */
export async function getAuditFilterOptions(outletId: string, tenantId: string): Promise<AuditFilterOptions> {
  const [actionRows, entityRows, staff] = await Promise.all([
    prisma.auditLog.findMany({ where: { outletId }, distinct: ['action'], select: { action: true }, orderBy: { action: 'asc' } }),
    prisma.auditLog.findMany({ where: { outletId }, distinct: ['entity'], select: { entity: true }, orderBy: { entity: 'asc' } }),
    prisma.staffUser.findMany({ where: { tenantId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ]);
  return {
    actions: actionRows.map((r) => r.action),
    entities: entityRows.map((r) => r.entity),
    staff,
  };
}

export { prettyAction } from './audit-labels';
