import { redirect } from 'next/navigation';
import { prisma } from '@cafeos/db';
import { getSession } from '@/lib/auth';
import { toTicket, type Ticket } from '@/lib/realtime';
import KdsClient from './KdsClient';

export const dynamic = 'force-dynamic';

/** Server component: require session, load the outlet's active kitchen tickets. */
export default async function KdsPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const [outlet, orders] = await Promise.all([
    prisma.outlet.findUnique({ where: { id: session.outletId }, select: { name: true } }),
    prisma.order.findMany({
      where: { outletId: session.outletId, status: { in: ['open', 'in_kitchen', 'ready'] } },
      orderBy: { placedAt: 'asc' }, // oldest first
      include: { items: true, table: { select: { label: true } } },
    }),
  ]);

  const initial: Ticket[] = orders.map(toTicket);
  const name = outlet?.name.split('—')[0]?.trim() ?? 'Kitchen';

  return <KdsClient outletName={name} initial={initial} />;
}
