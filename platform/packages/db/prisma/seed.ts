/**
 * Cafe OS — seed: one tenant ("Kahwa House"), one outlet, staff (PIN),
 * categories, menu (with GST rates + stations), modifiers, tables, one customer.
 * Mirrors the prototype's data so the POS works against a real DB immediately.
 *
 * Run:  npm run db:seed   (after db:push / db:migrate)
 */
import { PrismaClient, StaffRole, Station, TableState, Tier } from '@prisma/client';
import { createHash } from 'node:crypto';

const prisma = new PrismaClient();

const pin = (p: string) => createHash('sha256').update(p).digest('hex');
const phoneHash = (p: string) => createHash('sha256').update(p).digest('hex');

type Seed = {
  cat: string;
  name: string;
  pricePaise: number;
  gst: number;
  station: Station;
  tags: string[];
};

const CATEGORIES = ['Coffee', 'Chai & Tea', 'Coolers', 'All-Day', 'Bakery', 'Desserts'];

const MENU: Seed[] = [
  { cat: 'Coffee', name: 'Filter Kaapi', pricePaise: 12000, gst: 5, station: 'bar', tags: ['veg', 'bestseller'] },
  { cat: 'Coffee', name: 'Cappuccino', pricePaise: 18000, gst: 5, station: 'bar', tags: ['veg'] },
  { cat: 'Coffee', name: 'Cortado', pricePaise: 19000, gst: 5, station: 'bar', tags: ['veg'] },
  { cat: 'Coffee', name: 'Cold Brew', pricePaise: 22000, gst: 5, station: 'bar', tags: ['veg'] },
  { cat: 'Coffee', name: 'Spanish Latte', pricePaise: 24000, gst: 5, station: 'bar', tags: ['veg', 'bestseller'] },
  { cat: 'Coffee', name: 'Espresso', pricePaise: 14000, gst: 5, station: 'bar', tags: ['veg'] },
  { cat: 'Chai & Tea', name: 'Masala Chai', pricePaise: 9000, gst: 5, station: 'bar', tags: ['veg', 'bestseller'] },
  { cat: 'Chai & Tea', name: 'Kashmiri Kahwa', pricePaise: 13000, gst: 5, station: 'bar', tags: ['veg'] },
  { cat: 'Chai & Tea', name: 'Lemon Iced Tea', pricePaise: 12000, gst: 5, station: 'bar', tags: ['veg'] },
  { cat: 'Coolers', name: 'Mango Lassi', pricePaise: 15000, gst: 12, station: 'bar', tags: ['veg'] },
  { cat: 'Coolers', name: 'Rose Falooda', pricePaise: 18000, gst: 12, station: 'dessert', tags: ['veg'] },
  { cat: 'Coolers', name: 'Nimbu Soda', pricePaise: 8000, gst: 12, station: 'bar', tags: ['veg'] },
  { cat: 'All-Day', name: 'Masala Omelette', pricePaise: 16000, gst: 5, station: 'kitchen', tags: ['egg'] },
  { cat: 'All-Day', name: 'Paneer Kathi Roll', pricePaise: 19000, gst: 5, station: 'kitchen', tags: ['veg', 'bestseller'] },
  { cat: 'All-Day', name: 'Truffle Fries', pricePaise: 17000, gst: 5, station: 'kitchen', tags: ['veg'] },
  { cat: 'All-Day', name: 'Chicken Club', pricePaise: 24000, gst: 5, station: 'kitchen', tags: ['nonveg'] },
  { cat: 'All-Day', name: 'Avocado Toast', pricePaise: 21000, gst: 5, station: 'kitchen', tags: ['veg'] },
  { cat: 'All-Day', name: 'Maggi Masala Bowl', pricePaise: 12000, gst: 5, station: 'kitchen', tags: ['veg'] },
  { cat: 'Bakery', name: 'Butter Croissant', pricePaise: 14000, gst: 18, station: 'dessert', tags: ['veg'] },
  { cat: 'Bakery', name: 'Almond Danish', pricePaise: 16000, gst: 18, station: 'dessert', tags: ['veg'] },
  { cat: 'Bakery', name: 'Garlic Bread', pricePaise: 13000, gst: 18, station: 'kitchen', tags: ['veg'] },
  { cat: 'Desserts', name: 'Tiramisu Jar', pricePaise: 22000, gst: 18, station: 'dessert', tags: ['veg', 'bestseller'] },
  { cat: 'Desserts', name: 'Choco Brownie', pricePaise: 13000, gst: 18, station: 'dessert', tags: ['veg'] },
  { cat: 'Desserts', name: 'Gulab Jamun Cheesecake', pricePaise: 19000, gst: 18, station: 'dessert', tags: ['veg'] },
];

async function main() {
  console.log('🌱  Seeding Cafe OS…');

  // wipe (dev only) — order matters for FKs; cascade handles children
  await prisma.tenant.deleteMany({});

  const tenant = await prisma.tenant.create({
    data: { name: 'Kahwa House', plan: 'growth', gstin: '29ABCDE1234F1Z5' },
  });

  const outlet = await prisma.outlet.create({
    data: {
      tenantId: tenant.id,
      name: 'Kahwa House — Koramangala',
      stateCode: 'KA',
      gstin: '29ABCDE1234F1Z5',
      address: { line1: '5th Block, Koramangala', city: 'Bengaluru', pincode: '560095' },
    },
  });

  // staff with PIN login
  await prisma.staffUser.createMany({
    data: [
      { tenantId: tenant.id, outletId: outlet.id, name: 'Ravi (Owner)', role: StaffRole.owner, pinHash: pin('1111'), phone: '9000000001' },
      { tenantId: tenant.id, outletId: outlet.id, name: 'Priya', role: StaffRole.cashier, pinHash: pin('2222'), phone: '9000000002' },
      { tenantId: tenant.id, outletId: outlet.id, name: 'Kitchen', role: StaffRole.kitchen, pinHash: pin('3333') },
    ],
  });

  // categories + menu
  const catMap = new Map<string, string>();
  for (let i = 0; i < CATEGORIES.length; i++) {
    const c = await prisma.category.create({ data: { outletId: outlet.id, name: CATEGORIES[i]!, sort: i } });
    catMap.set(CATEGORIES[i]!, c.id);
  }
  for (const m of MENU) {
    await prisma.menuItem.create({
      data: {
        outletId: outlet.id,
        categoryId: catMap.get(m.cat)!,
        name: m.name,
        pricePaise: m.pricePaise,
        gstRate: m.gst,
        hsnCode: '2106',
        station: m.station,
        tags: m.tags,
      },
    });
  }

  // a coffee modifier group attached to coffee items
  const milk = await prisma.modifierGroup.create({
    data: {
      outletId: outlet.id,
      name: 'Milk',
      min: 1,
      max: 1,
      modifiers: { create: [{ name: 'Regular', pricePaise: 0 }, { name: 'Oat', pricePaise: 3000 }, { name: 'Almond', pricePaise: 3000 }] },
    },
  });
  const coffees = await prisma.menuItem.findMany({ where: { outletId: outlet.id, categoryId: catMap.get('Coffee')! } });
  for (const c of coffees) {
    await prisma.itemModifierGroup.create({ data: { itemId: c.id, groupId: milk.id } });
  }

  // tables with QR tokens
  const tables = [
    { label: 'T1', seats: 2 }, { label: 'T2', seats: 2 }, { label: 'T3', seats: 4 }, { label: 'T4', seats: 4 },
    { label: 'T5', seats: 6 }, { label: 'T6', seats: 2 }, { label: 'T7', seats: 4 }, { label: 'T8', seats: 2 },
  ];
  for (const t of tables) {
    await prisma.tableMap.create({
      data: { outletId: outlet.id, label: t.label, seats: t.seats, state: TableState.free, qrToken: `${outlet.id.slice(0, 8)}-${t.label}` },
    });
  }

  // rewards catalog (PWA redemption)
  await prisma.rewardCatalog.createMany({
    data: [
      { tenantId: tenant.id, name: 'Free Filter Kaapi', type: 'free_item', costPoints: 400, active: true },
      { tenantId: tenant.id, name: '₹50 off next visit', type: 'cashback', costPoints: 600, active: true },
      { tenantId: tenant.id, name: 'Buy-1-Get-1 Croissant', type: 'bogo', costPoints: 900, active: true },
      { tenantId: tenant.id, name: 'Free Tiramisu Jar', type: 'free_item', costPoints: 1200, active: true },
      { tenantId: tenant.id, name: 'Oat-milk upgrade ×5', type: 'topping', costPoints: 300, active: true },
    ],
  });

  // spin-the-wheel game
  await prisma.game.create({ data: { tenantId: tenant.id, key: 'spin_wheel', name: 'Spin the Wheel', active: true } });

  // one loyalty customer
  await prisma.customer.create({
    data: {
      tenantId: tenant.id,
      name: 'Arjun',
      phone: '9800000210',
      phoneHash: phoneHash('9800000210'),
      tier: Tier.gold,
      points: 1840,
      coins: 320,
      visitCount: 27,
      referralCode: 'ARJUN50',
    },
  });

  console.log(`✅  Seeded tenant=${tenant.id} outlet=${outlet.id}`);
  console.log(`    Staff PINs → Owner 1111 · Cashier 2222 · Kitchen 3333`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
