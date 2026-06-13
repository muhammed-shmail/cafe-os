import { cookies } from 'next/headers';
import { prisma } from '@cafeos/db';

/**
 * Customer identity for the PWA.
 *
 * Phase 1 demo: we bind the visitor to the tenant's seeded customer ("Arjun")
 * so loyalty/rewards/spin are demonstrable end-to-end. Phase 2 replaces this
 * with phone-OTP issuing the cookie. The cookie is the only thing that changes.
 */
export const CUSTOMER_COOKIE = 'cafeos_cust';

/** Resolve the current customer id (cookie if valid, else the demo customer). */
export async function resolveCustomerId(tenantId: string): Promise<string | null> {
  const fromCookie = cookies().get(CUSTOMER_COOKIE)?.value;
  if (fromCookie) {
    const ok = await prisma.customer.findFirst({ where: { id: fromCookie, tenantId }, select: { id: true } });
    if (ok) return ok.id;
  }
  const demo = await prisma.customer.findFirst({ where: { tenantId }, orderBy: { createdAt: 'asc' }, select: { id: true } });
  return demo?.id ?? null;
}

/** Resolve a table + its outlet/tenant from a scanned QR token (or a fallback for the demo). */
export async function resolveTable(qrToken?: string | null) {
  if (qrToken) {
    const t = await prisma.tableMap.findUnique({
      where: { qrToken },
      include: { outlet: { select: { id: true, name: true, tenantId: true } } },
    });
    if (t) return t;
  }
  // demo fallback: the table with the most recent active order, else T6, else first
  const recent = await prisma.order.findFirst({
    where: { status: { in: ['open', 'in_kitchen', 'ready'] }, tableId: { not: null } },
    orderBy: { placedAt: 'desc' },
    select: { tableId: true },
  });
  const where = recent?.tableId ? { id: recent.tableId } : { label: 'T6' };
  return prisma.tableMap.findFirst({
    where,
    include: { outlet: { select: { id: true, name: true, tenantId: true } } },
  });
}

/** The active order for a table (what the customer is waiting on), if any. */
export async function activeOrderForTable(tableId: string) {
  return prisma.order.findFirst({
    where: { tableId, status: { in: ['open', 'in_kitchen', 'ready', 'served'] } },
    orderBy: { placedAt: 'desc' },
    include: { items: { select: { nameSnapshot: true, qty: true, station: true } }, table: { select: { label: true } } },
  });
}
