import { redirect } from 'next/navigation';
import { prisma } from '@cafeos/db';
import { getSession } from '@/lib/auth';
import { canAccess, landingFor } from '@/lib/rbac';
import { readGstConfig } from '@/lib/tax';
import { readFloors, readTableFloors } from '@/lib/floors';
import PosClient, { type MenuCategory, type TableDto } from './PosClient';

export const dynamic = 'force-dynamic';

/** Server component: require a session, load menu + tables for the session's outlet. */
export default async function PosPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  // role-based access: kitchen staff belong on the KDS, not the till
  if (!canAccess(session.role, 'pos')) redirect(landingFor(session.role));

  const outlet = await prisma.outlet.findUnique({ where: { id: session.outletId } });
  if (!outlet) redirect('/api/auth/logout');

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

  const floors = readFloors(outlet.settings);
  const tableFloors = readTableFloors(outlet.settings);
  const tableDtos: TableDto[] = tables.map((t) => ({ id: t.id, label: t.label, seats: t.seats, state: t.state, floorId: tableFloors[t.id] ?? null }));
  const gst = readGstConfig(outlet.settings);

  return (
    <PosClient
      outlet={{ id: outlet.id, name: outlet.name, stateCode: outlet.stateCode ?? 'KA', gstEnabled: gst.enabled, gstRate: gst.rateOverride, gstInclusive: gst.inclusive }}
      staff={{ id: session.staffId, name: session.name, role: session.role }}
      menu={menu}
      tables={tableDtos}
      floors={floors}
    />
  );
}
