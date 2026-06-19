import { NextRequest, NextResponse } from 'next/server';
import { prisma, Prisma } from '@cafeos/db';
import { getSession } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATIONS = ['kitchen', 'bar', 'dessert'] as const;
const GST_RATES = [0, 5, 12, 18, 28];

function cleanStation(v: unknown): 'kitchen' | 'bar' | 'dessert' | null {
  return (STATIONS as readonly string[]).includes(v as string) ? (v as 'kitchen' | 'bar' | 'dessert') : null;
}

/**
 * POST /api/dashboard/menu — manage menu items (products).
 *   { action: 'availability', itemId, isAvailable }
 *   { action: 'price', itemId, pricePaise }
 *   { action: 'create', name, pricePaise, gstRate?, station?, categoryId?, description? }
 *   { action: 'update', itemId, name?, pricePaise?, gstRate?, station?, categoryId?, description?, isAvailable? }
 *   { action: 'delete', itemId }
 *   { action: 'category_create', name }
 * Owner/manager only, scoped to the session's outlet.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (session.role !== 'owner' && session.role !== 'manager') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { action } = body;

  // ---- create a category ----
  if (action === 'category_create') {
    const name = String(body.name ?? '').trim();
    if (!name) return NextResponse.json({ error: 'missing_name' }, { status: 400 });
    const count = await prisma.category.count({ where: { outletId: session.outletId } });
    const cat = await prisma.category.create({
      data: { outletId: session.outletId, name, sort: count },
      select: { id: true, name: true },
    });
    return NextResponse.json({ ok: true, category: cat });
  }

  // ---- create a new product ----
  if (action === 'create') {
    const name = String(body.name ?? '').trim();
    if (!name) return NextResponse.json({ error: 'missing_name' }, { status: 400 });
    const pricePaise = Math.round(Number(body.pricePaise));
    if (!Number.isFinite(pricePaise) || pricePaise < 0) return NextResponse.json({ error: 'invalid_price' }, { status: 400 });
    const gstRate = GST_RATES.includes(Number(body.gstRate)) ? Number(body.gstRate) : 5;

    // verify category ownership when provided
    let categoryId: string | null = null;
    if (body.categoryId) {
      const cat = await prisma.category.findFirst({ where: { id: body.categoryId, outletId: session.outletId }, select: { id: true } });
      if (!cat) return NextResponse.json({ error: 'bad_category' }, { status: 400 });
      categoryId = cat.id;
    }

    const created = await prisma.menuItem.create({
      data: {
        outletId: session.outletId,
        name,
        pricePaise,
        gstRate: new Prisma.Decimal(gstRate),
        station: cleanStation(body.station),
        categoryId,
        description: body.description ? String(body.description).trim() : null,
        isAvailable: true,
      },
      select: { id: true, name: true },
    });
    return NextResponse.json({ ok: true, item: created });
  }

  const { itemId } = body;
  if (!itemId) return NextResponse.json({ error: 'missing_item' }, { status: 400 });

  // ownership guard for all item-scoped actions
  const item = await prisma.menuItem.findFirst({ where: { id: itemId, outletId: session.outletId }, select: { id: true } });
  if (!item) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  if (action === 'availability') {
    const updated = await prisma.menuItem.update({ where: { id: itemId }, data: { isAvailable: !!body.isAvailable }, select: { id: true, isAvailable: true } });
    return NextResponse.json({ ok: true, item: updated });
  }

  if (action === 'price') {
    const pricePaise = Math.round(Number(body.pricePaise));
    if (!Number.isFinite(pricePaise) || pricePaise < 0) return NextResponse.json({ error: 'invalid_price' }, { status: 400 });
    const updated = await prisma.menuItem.update({ where: { id: itemId }, data: { pricePaise }, select: { id: true, pricePaise: true } });
    return NextResponse.json({ ok: true, item: updated });
  }

  // ---- full customize update ----
  if (action === 'update') {
    const data: Prisma.MenuItemUpdateInput = {};
    if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim();
    if (body.pricePaise !== undefined) {
      const pricePaise = Math.round(Number(body.pricePaise));
      if (!Number.isFinite(pricePaise) || pricePaise < 0) return NextResponse.json({ error: 'invalid_price' }, { status: 400 });
      data.pricePaise = pricePaise;
    }
    if (body.gstRate !== undefined && GST_RATES.includes(Number(body.gstRate))) data.gstRate = new Prisma.Decimal(Number(body.gstRate));
    if (body.station !== undefined) data.station = cleanStation(body.station);
    if (body.description !== undefined) data.description = body.description ? String(body.description).trim() : null;
    if (body.isAvailable !== undefined) data.isAvailable = !!body.isAvailable;
    if (body.categoryId !== undefined) {
      if (body.categoryId) {
        const cat = await prisma.category.findFirst({ where: { id: body.categoryId, outletId: session.outletId }, select: { id: true } });
        if (!cat) return NextResponse.json({ error: 'bad_category' }, { status: 400 });
        data.category = { connect: { id: cat.id } };
      } else {
        data.category = { disconnect: true };
      }
    }
    const updated = await prisma.menuItem.update({ where: { id: itemId }, data, select: { id: true, name: true } });
    return NextResponse.json({ ok: true, item: updated });
  }

  // ---- delete (blocked if the item is referenced by past orders) ----
  if (action === 'delete') {
    const orderCount = await prisma.orderItem.count({ where: { itemId } });
    if (orderCount > 0) {
      return NextResponse.json({ error: 'has_orders', message: 'This item appears on past orders — mark it Sold Out instead of deleting.' }, { status: 409 });
    }
    // recipes cascade-delete with the item
    await prisma.menuItem.delete({ where: { id: itemId } });
    return NextResponse.json({ ok: true, deleted: itemId });
  }

  return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
}
