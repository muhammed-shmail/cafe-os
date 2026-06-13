import { NextResponse } from 'next/server';
import { prisma } from '@cafeos/db';
import { getActiveOutlet } from '@/lib/context';

export const dynamic = 'force-dynamic';

/** GET /api/menu — categories + available items for the active outlet. */
export async function GET() {
  const outlet = await getActiveOutlet();

  const categories = await prisma.category.findMany({
    where: { outletId: outlet.id },
    orderBy: { sort: 'asc' },
    include: {
      items: {
        where: { isAvailable: true },
        orderBy: { name: 'asc' },
        include: { modGroups: { include: { group: { include: { modifiers: true } } } } },
      },
    },
  });

  // serialize Decimal gstRate -> number
  const data = categories.map((c) => ({
    id: c.id,
    name: c.name,
    items: c.items.map((i) => ({
      id: i.id,
      name: i.name,
      pricePaise: i.pricePaise,
      gstRate: Number(i.gstRate),
      station: i.station,
      tags: i.tags,
      modifierGroups: i.modGroups.map((mg) => ({
        id: mg.group.id,
        name: mg.group.name,
        min: mg.group.min,
        max: mg.group.max,
        options: mg.group.modifiers.map((m) => ({ id: m.id, name: m.name, pricePaise: m.pricePaise })),
      })),
    })),
  }));

  return NextResponse.json({ outlet: { id: outlet.id, name: outlet.name, stateCode: outlet.stateCode }, categories: data });
}
