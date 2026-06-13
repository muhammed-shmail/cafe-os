import { redirect } from 'next/navigation';
import { prisma } from '@cafeos/db';
import { getSession } from '@/lib/auth';
import PosClient, { type MenuCategory, type TableDto } from './PosClient';

export const dynamic = 'force-dynamic';

/** Server component: require a session, load menu + tables for the session's outlet. */
export default async function PosPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const outlet = await prisma.outlet.findUnique({ where: { id: session.outletId } });
  if (!outlet) redirect('/login');

  const [categories, tables] = await Promise.all([
    prisma.category.findMany({
      where: { outletId: outlet.id },
      orderBy: { sort: 'asc' },
      include: { items: { where: { isAvailable: true }, orderBy: { name: 'asc' } } },
    }),
    prisma.tableMap.findMany({ where: { outletId: outlet.id }, orderBy: { label: 'asc' } }),
  ]);

  const menu: MenuCategory[] = categories.map((c) => ({
    id: c.id,
    name: c.name,
    items: c.items.map((i) => ({
      id: i.id,
      name: i.name,
      pricePaise: i.pricePaise,
      gstRate: Number(i.gstRate),
      station: i.station,
      tags: i.tags,
    })),
  }));

  const tableDtos: TableDto[] = tables.map((t) => ({ id: t.id, label: t.label, seats: t.seats, state: t.state }));

  return (
    <PosClient
      outlet={{ id: outlet.id, name: outlet.name, stateCode: outlet.stateCode ?? 'KA' }}
      staff={{ id: session.staffId, name: session.name, role: session.role }}
      menu={menu}
      tables={tableDtos}
    />
  );
}
