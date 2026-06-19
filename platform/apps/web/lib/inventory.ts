import { prisma, type Prisma } from '@cafeos/db';
import { convertForDeduction } from '@cafeos/core';
import { createNotification } from './notify';

/**
 * Cafe OS — recipe-based inventory deduction (Phase A).
 *
 * When an order is created we translate sold menu items into raw-material
 * consumption via their recipes, decrement stock, and append an immutable
 * StockLedger entry (reason "sale") so consumption is fully auditable.
 *
 * Design rules:
 *  - Runs INSIDE the order transaction → stock + ledger commit atomically with
 *    the order, or not at all.
 *  - Never blocks a sale: items without a recipe consume nothing; stock is
 *    allowed to go negative (you still sold it) and that surfaces as an alert.
 *  - Idempotent by construction: the orders route returns early on a replayed
 *    clientUuid, so deduction only ever runs on first creation.
 */

type SoldLine = { itemId?: string | null; qty: number };

/** Apply recipe consumption for an order's lines. Returns the stock item ids touched. */
export async function applyRecipeConsumption(
  tx: Prisma.TransactionClient,
  opts: { outletId: string; orderId: string; lines: SoldLine[] },
): Promise<string[]> {
  // qty sold per menu item (a cart may list the same item on two lines)
  const soldByItem = new Map<string, number>();
  for (const l of opts.lines) {
    if (!l.itemId) continue;
    soldByItem.set(l.itemId, (soldByItem.get(l.itemId) ?? 0) + l.qty);
  }
  if (soldByItem.size === 0) return [];

  const recipes = await tx.recipe.findMany({
    where: { itemId: { in: [...soldByItem.keys()] } },
    include: { stockItem: { select: { id: true, unit: true, outletId: true } } },
  });
  if (recipes.length === 0) return [];

  // aggregate consumption per stock item, converting recipe units → stock units
  const consume = new Map<string, number>();
  for (const r of recipes) {
    if (r.stockItem.outletId !== opts.outletId) continue; // tenant safety
    const sold = soldByItem.get(r.itemId) ?? 0;
    if (sold <= 0) continue;
    const perPlate = convertForDeduction(Number(r.qty), r.unit, r.stockItem.unit);
    const amount = perPlate * sold;
    if (amount <= 0) continue;
    consume.set(r.stockItem.id, (consume.get(r.stockItem.id) ?? 0) + amount);
  }
  if (consume.size === 0) return [];

  for (const [stockItemId, amount] of consume) {
    await tx.stockItem.update({
      where: { id: stockItemId },
      data: { qtyOnHand: { decrement: amount } },
    });
    await tx.stockLedger.create({
      data: {
        outletId: opts.outletId,
        stockItemId,
        change: -amount, // negative = consumed
        reason: 'sale',
        refId: opts.orderId,
      },
    });
  }

  return [...consume.keys()];
}

/**
 * Reverse recipe consumption for voided/removed order lines — the mirror of
 * applyRecipeConsumption. Increments stock back and appends a positive
 * StockLedger entry (reason "void"), keeping stock auditable and symmetric.
 * Returns the stock item ids touched.
 */
export async function reverseRecipeConsumption(
  tx: Prisma.TransactionClient,
  opts: { outletId: string; orderId: string; lines: SoldLine[] },
): Promise<string[]> {
  const byItem = new Map<string, number>();
  for (const l of opts.lines) {
    if (!l.itemId) continue;
    byItem.set(l.itemId, (byItem.get(l.itemId) ?? 0) + l.qty);
  }
  if (byItem.size === 0) return [];

  const recipes = await tx.recipe.findMany({
    where: { itemId: { in: [...byItem.keys()] } },
    include: { stockItem: { select: { id: true, unit: true, outletId: true } } },
  });
  if (recipes.length === 0) return [];

  const restore = new Map<string, number>();
  for (const r of recipes) {
    if (r.stockItem.outletId !== opts.outletId) continue;
    const qty = byItem.get(r.itemId) ?? 0;
    if (qty <= 0) continue;
    const perPlate = convertForDeduction(Number(r.qty), r.unit, r.stockItem.unit);
    const amount = perPlate * qty;
    if (amount <= 0) continue;
    restore.set(r.stockItem.id, (restore.get(r.stockItem.id) ?? 0) + amount);
  }
  if (restore.size === 0) return [];

  for (const [stockItemId, amount] of restore) {
    await tx.stockItem.update({
      where: { id: stockItemId },
      data: { qtyOnHand: { increment: amount } },
    });
    await tx.stockLedger.create({
      data: {
        outletId: opts.outletId,
        stockItemId,
        change: amount, // positive = restored
        reason: 'void',
        refId: opts.orderId,
      },
    });
  }

  return [...restore.keys()];
}

/**
 * Raise low-stock notifications for the given stock items (call AFTER the order
 * commits). Deduped: one open alert per item until it's read/restocked. Best
 * effort — never throws into the order path.
 */
export async function emitLowStockAlerts(outletId: string, stockItemIds: string[]): Promise<void> {
  if (stockItemIds.length === 0) return;
  try {
    const items = await prisma.stockItem.findMany({
      where: { id: { in: stockItemIds }, outletId },
      select: { id: true, name: true, unit: true, qtyOnHand: true, reorderLevel: true },
    });

    for (const s of items) {
      const onHand = Number(s.qtyOnHand);
      const reorder = Number(s.reorderLevel);
      if (reorder <= 0 || onHand > reorder) continue; // healthy

      const severity = onHand <= 0 ? 'critical' : onHand <= reorder * 0.5 ? 'critical' : 'warn';
      const type = onHand <= 0 ? 'out_of_stock' : 'low_stock';

      // dedupe against an existing open alert for this item
      const open = await prisma.notification.findFirst({
        where: { outletId, entity: 'stock_item', entityId: s.id, readAt: null, type: { in: ['low_stock', 'out_of_stock'] } },
        select: { id: true, type: true, severity: true },
      });

      const title = onHand <= 0 ? `${s.name} is out of stock` : `${s.name} is running low`;
      const body = `${onHand}${s.unit} on hand · reorder at ${reorder}${s.unit}`;

      if (open) {
        // escalate an existing alert if it got worse
        if (open.type !== type || open.severity !== severity) {
          await prisma.notification.update({ where: { id: open.id }, data: { type, severity, title, body } });
        }
        continue;
      }

      await createNotification({
        outletId,
        type,
        severity,
        title,
        body,
        entity: 'stock_item',
        entityId: s.id,
        meta: { onHand, reorder, unit: s.unit },
      });
    }
  } catch (e) {
    console.error('low-stock alert generation failed', e);
  }
}
