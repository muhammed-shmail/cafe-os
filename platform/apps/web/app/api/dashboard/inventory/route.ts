import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@cafeos/db';
import { getSession } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (session.role !== 'owner' && session.role !== 'manager') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { action } = body;

    if (action === 'purchase') {
      const { stockItemId, qty, unitCostPaise } = body;
      if (!stockItemId || !qty || unitCostPaise == null) {
        return NextResponse.json({ error: 'missing fields' }, { status: 400 });
      }

      const item = await prisma.stockItem.findUnique({ where: { id: stockItemId } });
      if (!item || item.outletId !== session.outletId) {
        return NextResponse.json({ error: 'item_not_found' }, { status: 404 });
      }

      const purchaseQty = Number(qty);
      const costPerUnit = Number(unitCostPaise);
      const totalPurchaseCost = purchaseQty * costPerUnit;

      const oldQty = Number(item.qtyOnHand);
      const newQty = oldQty + purchaseQty;
      
      let newAvgCost = item.avgCostPaise;
      if (newQty > 0) {
        newAvgCost = Math.round(((oldQty * item.avgCostPaise) + totalPurchaseCost) / newQty);
      }

      const updated = await prisma.$transaction([
        prisma.stockItem.update({
          where: { id: stockItemId },
          data: {
            qtyOnHand: newQty,
            avgCostPaise: newAvgCost,
          },
        }),
        prisma.stockLedger.create({
          data: {
            outletId: session.outletId,
            stockItemId,
            change: purchaseQty,
            reason: 'purchase',
          },
        }),
      ]);

      return NextResponse.json({ ok: true, item: updated[0] });
    }

    if (action === 'adjust') {
      const { stockItemId, qtyOnHand } = body;
      if (!stockItemId || qtyOnHand == null) {
        return NextResponse.json({ error: 'missing fields' }, { status: 400 });
      }

      const item = await prisma.stockItem.findUnique({ where: { id: stockItemId } });
      if (!item || item.outletId !== session.outletId) {
        return NextResponse.json({ error: 'item_not_found' }, { status: 404 });
      }

      const targetQty = Number(qtyOnHand);
      const oldQty = Number(item.qtyOnHand);
      const change = targetQty - oldQty;

      const updated = await prisma.$transaction([
        prisma.stockItem.update({
          where: { id: stockItemId },
          data: { qtyOnHand: targetQty },
        }),
        prisma.stockLedger.create({
          data: {
            outletId: session.outletId,
            stockItemId,
            change,
            reason: 'adjustment',
          },
        }),
      ]);

      return NextResponse.json({ ok: true, item: updated[0] });
    }

    if (action === 'recipe') {
      const { itemId, stockItemId, qty, unit } = body;
      if (!itemId || !stockItemId || !qty) {
        return NextResponse.json({ error: 'missing fields' }, { status: 400 });
      }

      // Check item and stockItem exist under the outlet
      const [menuItem, stockItem] = await Promise.all([
        prisma.menuItem.findFirst({ where: { id: itemId, outletId: session.outletId } }),
        prisma.stockItem.findFirst({ where: { id: stockItemId, outletId: session.outletId } }),
      ]);

      if (!menuItem || !stockItem) {
        return NextResponse.json({ error: 'item_or_material_not_found' }, { status: 404 });
      }

      const recipe = await prisma.recipe.create({
        data: {
          itemId,
          stockItemId,
          qty: Number(qty),
          // optional authored unit; null ⇒ inherit the stock item's unit
          unit: typeof unit === 'string' && unit.trim() ? unit.trim() : null,
        },
      });

      return NextResponse.json({ ok: true, recipe });
    }

    if (action === 'recipe_delete') {
      const { recipeId } = body;
      if (!recipeId) return NextResponse.json({ error: 'missing fields' }, { status: 400 });
      // scope: the recipe's menu item must belong to this outlet
      const recipe = await prisma.recipe.findFirst({ where: { id: recipeId, item: { outletId: session.outletId } }, select: { id: true } });
      if (!recipe) return NextResponse.json({ error: 'recipe_not_found' }, { status: 404 });
      await prisma.recipe.delete({ where: { id: recipeId } });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
  } catch (e: any) {
    console.error('Inventory operation failed:', e);
    return NextResponse.json({ error: e.message ?? 'failed' }, { status: 500 });
  }
}
