import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@cafeos/db';
import { getSession } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/dashboard/revenue?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Date-wise revenue for the owner dashboard / sales report. Returns the total
 * revenue, order count and AOV for the range plus a gap-filled per-day series
 * (so the chart has a point for every day). Owner/manager only, scoped to the
 * session's outlet. Real data only — empty days are honest zeros.
 *
 * Reuses the timezone-aware date-cast aggregation already proven in lib/analytics.
 */
const TZ = 'Asia/Kolkata';
const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const isDate = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (session.role !== 'owner' && session.role !== 'manager') return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  // Default range: last 7 days (today inclusive) in the outlet's wall-clock zone.
  const todayKey = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
  const qpFrom = req.nextUrl.searchParams.get('from');
  const qpTo = req.nextUrl.searchParams.get('to');
  const toD = isDate(qpTo) ? new Date(`${qpTo}T00:00:00`) : todayKey;
  let fromD = isDate(qpFrom) ? new Date(`${qpFrom}T00:00:00`) : new Date(toD.getTime() - 6 * 864e5);
  if (fromD > toD) fromD = new Date(toD.getTime() - 6 * 864e5);
  // cap span to one year to keep the series bounded
  if ((toD.getTime() - fromD.getTime()) / 864e5 > 366) fromD = new Date(toD.getTime() - 366 * 864e5);

  const from = ymd(fromD);
  const to = ymd(toD);

  const rows = await prisma.$queryRaw<{ day: Date; orders: number; gross: number }[]>`
    SELECT ("placedAt" AT TIME ZONE ${TZ})::date AS day,
           COUNT(*)::int AS orders,
           COALESCE(SUM("totalPaise"), 0)::int AS gross
    FROM orders
    WHERE "outletId" = ${session.outletId}::uuid
      AND "status" <> 'cancelled'
      AND ("placedAt" AT TIME ZONE ${TZ})::date >= ${from}::date
      AND ("placedAt" AT TIME ZONE ${TZ})::date <= ${to}::date
    GROUP BY 1
    ORDER BY 1
  `;

  const byDay = new Map(rows.map((r) => [ymd(new Date(r.day)), { orders: r.orders, gross: r.gross }]));

  const daily: { date: string; label: string; dateLabel: string; orders: number; grossPaise: number }[] = [];
  for (let d = new Date(fromD); d <= toD; d = new Date(d.getTime() + 864e5)) {
    const key = ymd(d);
    const hit = byDay.get(key) ?? { orders: 0, gross: 0 };
    daily.push({ date: key, label: DOW[d.getDay()]!, dateLabel: `${d.getDate()} ${MON[d.getMonth()]}`, orders: hit.orders, grossPaise: hit.gross });
  }

  const totalPaise = daily.reduce((s, d) => s + d.grossPaise, 0);
  const orders = daily.reduce((s, d) => s + d.orders, 0);
  const aovPaise = orders > 0 ? Math.round(totalPaise / orders) : 0;

  return NextResponse.json({ from, to, days: daily.length, totalPaise, orders, aovPaise, daily });
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
