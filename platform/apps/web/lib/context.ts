import { prisma } from '@cafeos/db';

/**
 * Resolve the active outlet. In production this comes from the authenticated
 * session (staff -> outlet) and the tenant interceptor sets RLS context.
 * For the Phase-1 dev scaffold we resolve the seeded outlet.
 */
export async function getActiveOutlet() {
  const outlet = await prisma.outlet.findFirst({ orderBy: { name: 'asc' } });
  if (!outlet) throw new Error('No outlet seeded — run `npm run db:seed`.');
  return outlet;
}

/** Next per-outlet order number (dev-simple; production uses a sequence/advisory lock). */
export async function nextOrderNumber(outletId: string): Promise<number> {
  const last = await prisma.order.findFirst({
    where: { outletId },
    orderBy: { number: 'desc' },
    select: { number: true },
  });
  return (last?.number ?? 100) + 1;
}
