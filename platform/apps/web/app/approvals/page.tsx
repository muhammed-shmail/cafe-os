import { redirect } from 'next/navigation';
import { prisma } from '@cafeos/db';
import { getSession } from '@/lib/auth';
import ApprovalsClient, { type PendingOrder } from './ApprovalsClient';

export const dynamic = 'force-dynamic';

/**
 * Waiter approval dashboard. Any signed-in staff member can view; kitchen staff
 * see it read-only (they can't approve). QR orders land here as pending and only
 * reach the KDS once a waiter confirms.
 */
export default async function ApprovalsPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const outlet = await prisma.outlet.findUnique({ where: { id: session.outletId }, select: { name: true } });
  if (!outlet) redirect('/api/auth/logout');

  const orders = await prisma.order.findMany({
    where: { outletId: session.outletId, status: 'pending_approval' },
    orderBy: { placedAt: 'asc' },
    include: { items: { orderBy: { id: 'asc' } }, table: { select: { label: true } } },
  });

  const initial: PendingOrder[] = orders.map((o) => ({
    id: o.id,
    number: o.number,
    table: o.table?.label ?? '—',
    channel: o.channel,
    placedAt: o.placedAt.getTime(),
    totalPaise: o.totalPaise,
    items: o.items.map((i) => ({ id: i.id, name: i.nameSnapshot, qty: i.qty, station: i.station, notes: i.notes, unitPricePaise: i.unitPricePaise })),
  }));

  const name = outlet.name.split('—')[0]?.trim() ?? 'Outlet';
  return <ApprovalsClient outletName={name} role={session.role} initial={initial} />;
}
