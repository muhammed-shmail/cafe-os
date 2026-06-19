/**
 * Cafe OS — activate recipe-based inventory.
 *
 * Idempotent & non-destructive: for every outlet, creates the raw-material
 * stock items it's missing and links recipes to existing menu items (by name)
 * that don't have one yet. Safe to re-run.
 *
 * Run:  npm run -w @cafeos/db activate:inventory
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// name, unit, opening qty on hand, reorder level, avg cost (paise per unit)
const MATERIALS: [string, string, number, number, number][] = [
  ['Milk', 'l', 50, 10, 5000],
  ['Sugar', 'g', 20000, 4000, 4],
  ['Tea Powder', 'g', 5000, 1000, 30],
  ['Coffee Beans', 'g', 8000, 1500, 80],
  ['Tea Masala', 'g', 1000, 200, 200],
  ['Lemon', 'pcs', 100, 20, 500],
  ['Mango Pulp', 'ml', 10000, 2000, 6],
  ['Rose Syrup', 'ml', 5000, 1000, 8],
  ['Soda', 'ml', 20000, 4000, 2],
  ['Eggs', 'pcs', 200, 40, 700],
  ['Bread', 'pcs', 300, 60, 300],
  ['Paneer', 'g', 5000, 1000, 40],
  ['Chicken', 'g', 8000, 1500, 35],
  ['Potato', 'g', 20000, 4000, 3],
  ['Butter', 'g', 5000, 1000, 50],
  ['Flour', 'g', 20000, 4000, 4],
  ['Cocoa', 'g', 3000, 600, 60],
  ['Mascarpone', 'g', 3000, 600, 90],
  ['Avocado', 'pcs', 50, 10, 12000],
  ['Noodles', 'pcs', 100, 20, 1500],
];

// menu item name → recipe lines [material, qty, optional recipe unit]
const RECIPES: Record<string, [string, number, string?][]> = {
  'Filter Kaapi': [['Coffee Beans', 12], ['Milk', 100, 'ml'], ['Sugar', 10]],
  Cappuccino: [['Coffee Beans', 14], ['Milk', 150, 'ml'], ['Sugar', 8]],
  Cortado: [['Coffee Beans', 14], ['Milk', 120, 'ml']],
  'Cold Brew': [['Coffee Beans', 18]],
  'Spanish Latte': [['Coffee Beans', 16], ['Milk', 180, 'ml'], ['Sugar', 12]],
  Espresso: [['Coffee Beans', 16]],
  'Masala Chai': [['Tea Powder', 10], ['Milk', 100, 'ml'], ['Sugar', 15], ['Tea Masala', 2]],
  'Kashmiri Kahwa': [['Tea Powder', 8], ['Sugar', 10]],
  'Lemon Iced Tea': [['Tea Powder', 6], ['Lemon', 0.5], ['Sugar', 12]],
  'Mango Lassi': [['Mango Pulp', 80], ['Milk', 100, 'ml'], ['Sugar', 15]],
  'Rose Falooda': [['Rose Syrup', 30], ['Milk', 120, 'ml'], ['Sugar', 10]],
  'Nimbu Soda': [['Lemon', 1], ['Soda', 200], ['Sugar', 10]],
  'Masala Omelette': [['Eggs', 3], ['Butter', 10]],
  'Paneer Kathi Roll': [['Paneer', 80], ['Flour', 60], ['Butter', 8]],
  'Truffle Fries': [['Potato', 200], ['Butter', 10]],
  'Chicken Club': [['Chicken', 120], ['Bread', 2], ['Butter', 8]],
  'Avocado Toast': [['Avocado', 1], ['Bread', 2]],
  'Maggi Masala Bowl': [['Noodles', 1]],
  'Butter Croissant': [['Flour', 80], ['Butter', 30]],
  'Almond Danish': [['Flour', 70], ['Butter', 25]],
  'Garlic Bread': [['Bread', 2], ['Butter', 15]],
  'Tiramisu Jar': [['Mascarpone', 60], ['Coffee Beans', 5], ['Cocoa', 8]],
  'Choco Brownie': [['Flour', 50], ['Cocoa', 20], ['Butter', 30], ['Sugar', 30]],
  'Gulab Jamun Cheesecake': [['Mascarpone', 50], ['Flour', 30], ['Sugar', 25]],
};

async function main() {
  const outlets = await prisma.outlet.findMany({ select: { id: true, name: true } });
  if (outlets.length === 0) {
    console.log('No outlets found — run `npm run db:seed` first.');
    return;
  }

  for (const outlet of outlets) {
    console.log(`\n📦  Activating inventory for ${outlet.name}`);
    let madeStock = 0;
    let madeRecipes = 0;

    // 1) raw materials (skip ones that already exist by name)
    const byName = new Map<string, string>();
    for (const [name, unit, qty, reorder, cost] of MATERIALS) {
      let item = await prisma.stockItem.findFirst({ where: { outletId: outlet.id, name }, select: { id: true } });
      if (!item) {
        item = await prisma.stockItem.create({
          data: { outletId: outlet.id, name, unit, qtyOnHand: qty, reorderLevel: reorder, avgCostPaise: cost },
          select: { id: true },
        });
        madeStock++;
      }
      byName.set(name, item.id);
    }

    // 2) recipes for existing menu items (skip items that already have one)
    const menuItems = await prisma.menuItem.findMany({ where: { outletId: outlet.id }, select: { id: true, name: true } });
    for (const mi of menuItems) {
      const recipe = RECIPES[mi.name];
      if (!recipe) continue;
      const existing = await prisma.recipe.count({ where: { itemId: mi.id } });
      if (existing > 0) continue;
      for (const [material, qty, unit] of recipe) {
        const stockItemId = byName.get(material);
        if (!stockItemId) continue;
        await prisma.recipe.create({ data: { itemId: mi.id, stockItemId, qty, unit: unit ?? null } });
        madeRecipes++;
      }
    }

    console.log(`   ✓ ${madeStock} stock items added, ${madeRecipes} recipe lines linked`);
  }

  const totals = await prisma.$transaction([prisma.stockItem.count(), prisma.recipe.count()]);
  console.log(`\n✅  Inventory active — ${totals[0]} stock items, ${totals[1]} recipe lines total.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
