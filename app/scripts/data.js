/* =========================================================================
   Cafe OS — Seed data (mock outlet: "Kahwa House", Bengaluru)
   Money stored as integer paise (per DB schema 03). ₹ helpers in store.js
   ========================================================================= */
window.CAFE = window.CAFE || {};

CAFE.outlet = {
  name: 'Kahwa House',
  tagline: 'Specialty Coffee · Koramangala, Bengaluru',
  stateCode: 'KA',
  gstin: '29ABCDE1234F1Z5',
  accent: '#E8902A',
};

/* category, station for KOT routing, price in paise, gst rate, tags */
CAFE.categories = [
  { id: 'coffee',  name: 'Coffee',     icon: '☕' },
  { id: 'tea',     name: 'Chai & Tea', icon: '🍵' },
  { id: 'cooler',  name: 'Coolers',    icon: '🥤' },
  { id: 'food',    name: 'All-Day',    icon: '🍳' },
  { id: 'bakery',  name: 'Bakery',     icon: '🥐' },
  { id: 'dessert', name: 'Desserts',   icon: '🍰' },
];

CAFE.menu = [
  // Coffee  (station: bar)
  { id: 'm1',  cat: 'coffee', name: 'Filter Kaapi',        price: 12000, gst: 5,  station: 'bar',     tags: ['veg','bestseller'], emoji: '☕' },
  { id: 'm2',  cat: 'coffee', name: 'Cappuccino',          price: 18000, gst: 5,  station: 'bar',     tags: ['veg'],              emoji: '☕' },
  { id: 'm3',  cat: 'coffee', name: 'Cortado',             price: 19000, gst: 5,  station: 'bar',     tags: ['veg'],              emoji: '☕' },
  { id: 'm4',  cat: 'coffee', name: 'Cold Brew',           price: 22000, gst: 5,  station: 'bar',     tags: ['veg','spicy'],      emoji: '🧊' },
  { id: 'm5',  cat: 'coffee', name: 'Spanish Latte',       price: 24000, gst: 5,  station: 'bar',     tags: ['veg','bestseller'], emoji: '☕' },
  { id: 'm6',  cat: 'coffee', name: 'Espresso',            price: 14000, gst: 5,  station: 'bar',     tags: ['veg'],              emoji: '⚡' },
  // Chai & Tea
  { id: 'm7',  cat: 'tea',    name: 'Masala Chai',         price: 9000,  gst: 5,  station: 'bar',     tags: ['veg','bestseller'], emoji: '🫖' },
  { id: 'm8',  cat: 'tea',    name: 'Kashmiri Kahwa',      price: 13000, gst: 5,  station: 'bar',     tags: ['veg'],              emoji: '🍵' },
  { id: 'm9',  cat: 'tea',    name: 'Lemon Iced Tea',      price: 12000, gst: 5,  station: 'bar',     tags: ['veg'],              emoji: '🍋' },
  // Coolers
  { id: 'm10', cat: 'cooler', name: 'Mango Lassi',         price: 15000, gst: 12, station: 'bar',     tags: ['veg'],              emoji: '🥭' },
  { id: 'm11', cat: 'cooler', name: 'Rose Falooda',        price: 18000, gst: 12, station: 'dessert', tags: ['veg'],              emoji: '🌹' },
  { id: 'm12', cat: 'cooler', name: 'Nimbu Soda',          price: 8000,  gst: 12, station: 'bar',     tags: ['veg'],              emoji: '🥤' },
  // All-day food
  { id: 'm13', cat: 'food',   name: 'Masala Omelette',     price: 16000, gst: 5,  station: 'kitchen', tags: ['egg'],              emoji: '🍳' },
  { id: 'm14', cat: 'food',   name: 'Paneer Kathi Roll',   price: 19000, gst: 5,  station: 'kitchen', tags: ['veg','bestseller'], emoji: '🌯' },
  { id: 'm15', cat: 'food',   name: 'Truffle Fries',       price: 17000, gst: 5,  station: 'kitchen', tags: ['veg'],              emoji: '🍟' },
  { id: 'm16', cat: 'food',   name: 'Chicken Club',        price: 24000, gst: 5,  station: 'kitchen', tags: ['nonveg'],           emoji: '🥪' },
  { id: 'm17', cat: 'food',   name: 'Avocado Toast',       price: 21000, gst: 5,  station: 'kitchen', tags: ['veg'],              emoji: '🥑' },
  { id: 'm18', cat: 'food',   name: 'Maggi Masala Bowl',   price: 12000, gst: 5,  station: 'kitchen', tags: ['veg'],              emoji: '🍜' },
  // Bakery
  { id: 'm19', cat: 'bakery', name: 'Butter Croissant',    price: 14000, gst: 18, station: 'dessert', tags: ['veg'],              emoji: '🥐' },
  { id: 'm20', cat: 'bakery', name: 'Almond Danish',       price: 16000, gst: 18, station: 'dessert', tags: ['veg'],              emoji: '🥐' },
  { id: 'm21', cat: 'bakery', name: 'Garlic Bread',        price: 13000, gst: 18, station: 'kitchen', tags: ['veg'],              emoji: '🍞' },
  // Desserts
  { id: 'm22', cat: 'dessert',name: 'Tiramisu Jar',        price: 22000, gst: 18, station: 'dessert', tags: ['veg','bestseller'], emoji: '🍮' },
  { id: 'm23', cat: 'dessert',name: 'Choco Brownie',       price: 13000, gst: 18, station: 'dessert', tags: ['veg'],              emoji: '🍫' },
  { id: 'm24', cat: 'dessert',name: 'Gulab Jamun Cheesecake', price: 19000, gst: 18, station: 'dessert', tags: ['veg'], emoji: '🍰' },
];

/* common modifiers offered on the POS item sheet */
CAFE.modifiers = {
  coffee: [
    { group: 'Milk',  pick: 1, opts: [{ n: 'Regular', p: 0 }, { n: 'Oat +₹30', p: 3000 }, { n: 'Almond +₹30', p: 3000 }] },
    { group: 'Shots', pick: 1, opts: [{ n: 'Single', p: 0 }, { n: 'Double +₹40', p: 4000 }] },
    { group: 'Sugar', pick: 1, opts: [{ n: 'Normal', p: 0 }, { n: 'Less', p: 0 }, { n: 'None', p: 0 }] },
  ],
  food: [
    { group: 'Spice', pick: 1, opts: [{ n: 'Mild', p: 0 }, { n: 'Medium', p: 0 }, { n: 'Extra hot', p: 0 }] },
    { group: 'Add',   pick: 1, opts: [{ n: 'None', p: 0 }, { n: 'Extra cheese +₹40', p: 4000 }, { n: 'Fried egg +₹30', p: 3000 }] },
  ],
};

/* tables for the floor map */
CAFE.tables = [
  { id: 'T1', seats: 2, state: 'free' },   { id: 'T2', seats: 2, state: 'seated' },
  { id: 'T3', seats: 4, state: 'free' },   { id: 'T4', seats: 4, state: 'billed' },
  { id: 'T5', seats: 6, state: 'free' },   { id: 'T6', seats: 2, state: 'seated' },
  { id: 'T7', seats: 4, state: 'free' },   { id: 'T8', seats: 2, state: 'free' },
];

/* the customer in the PWA demo */
CAFE.customer = {
  name: 'Arjun',
  phone: '98••• ••210',
  tier: 'Gold',
  points: 1840,
  coins: 320,
  visits: 27,
  streak: 4,
  nextTierAt: 2500,
  spinsLeft: 1,
  referral: 'ARJUN50',
};

CAFE.rewards = [
  { id: 'r1', name: 'Free Filter Kaapi',   cost: 400,  type: 'free_item', emoji: '☕' },
  { id: 'r2', name: '₹50 off next visit',  cost: 600,  type: 'cashback',  emoji: '💸' },
  { id: 'r3', name: 'Buy-1-Get-1 Croissant', cost: 900, type: 'bogo',     emoji: '🥐' },
  { id: 'r4', name: 'Free Tiramisu Jar',   cost: 1200, type: 'free_item', emoji: '🍮' },
  { id: 'r5', name: 'Oat-milk upgrade ×5', cost: 300,  type: 'topping',   emoji: '🥛' },
];

/* spin-the-wheel segments (server-authoritative in prod; weighted here) */
CAFE.wheel = [
  { label: '+20 coins',   kind: 'coins',  value: 20,  color: '#E8902A', weight: 26 },
  { label: 'Free Cookie', kind: 'coupon', value: 'cookie', color: '#4E7A4A', weight: 10 },
  { label: '+5 coins',    kind: 'coins',  value: 5,   color: '#D9A93A', weight: 30 },
  { label: '₹30 off',     kind: 'coupon', value: '₹30 off', color: '#C3492F', weight: 12 },
  { label: 'Try again',   kind: 'none',   value: 0,   color: '#9A8473', weight: 14 },
  { label: '+50 coins',   kind: 'coins',  value: 50,  color: '#8E3B6B', weight: 8  },
];

/* order-tracking entertainment carousel */
CAFE.entertainment = [
  { kind: 'fact',  title: 'Did you know?', body: 'Our beans are roasted 19 km away in Chikkamagaluru — picked within 48 hours of harvest.', emoji: '🌱' },
  { kind: 'story', title: 'The Kahwa story', body: 'Kahwa is a 16th-century Kashmiri green tea brewed with saffron, cardamom & almond. We make ours daily.', emoji: '📖' },
  { kind: 'challenge', title: 'Mini challenge', body: 'Guess the origin of today’s single-origin pour-over and win 30 coins.', emoji: '🎯' },
  { kind: 'offer', title: 'While you wait', body: 'Add a warm Choco Brownie for just ₹99 — kitchen can slip it in now.', emoji: '🍫', cta: 'Add ₹99' },
];

/* dashboard analytics seed */
CAFE.analytics = {
  todaySales: 4286000, todayOrders: 142, aov: 30183, footfall: 198,
  salesTrend: [62, 48, 55, 71, 90, 120, 142],          // last 7 days (orders)
  hourly: [4,3,2,6,12,22,28,18,14,20,26,30,24,16,12,9,14,21,27,22,15,10,7,5],
  menuQuadrant: [
    { name: 'Spanish Latte', pop: 92, profit: 78, q: 'star'   },
    { name: 'Masala Chai',   pop: 88, profit: 40, q: 'plow'   },
    { name: 'Tiramisu Jar',  pop: 35, profit: 82, q: 'puzzle' },
    { name: 'Cold Brew',     pop: 30, profit: 30, q: 'dog'    },
    { name: 'Paneer Roll',   pop: 74, profit: 66, q: 'star'   },
    { name: 'Avocado Toast', pop: 28, profit: 70, q: 'puzzle' },
    { name: 'Nimbu Soda',    pop: 80, profit: 22, q: 'plow'   },
    { name: 'Almond Danish', pop: 22, profit: 24, q: 'dog'    },
  ],
  lowStock: [
    { name: 'Oat Milk',       qty: '3 L',   level: 'critical' },
    { name: 'Espresso Beans', qty: '1.2 kg', level: 'low' },
    { name: 'Vanilla Syrup',  qty: '400 ml', level: 'low' },
  ],
  briefing: [
    { tone: 'up',   text: 'Sales are ₹12.4k ahead of last Wednesday — the 5–7pm rush drove it.', action: 'See heatmap' },
    { tone: 'warn', text: '14 Gold customers haven’t visited in 21 days. A ₹50 win-back could recover ~₹9k.', action: 'Draft WhatsApp' },
    { tone: 'idea', text: 'Tiramisu Jar is a “Puzzle” — high margin, low orders. Feature it on the PWA home.', action: 'Promote' },
  ],
};
