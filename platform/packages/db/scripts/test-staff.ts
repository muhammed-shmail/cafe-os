import { prisma } from '../src/index';

async function main() {
  const tenant = await prisma.tenant.findFirst();
  const outlet = await prisma.outlet.findFirst();
  if (!tenant || !outlet) {
    console.error("No tenant or outlet found");
    return;
  }
  console.log("Tenant:", tenant.id, "Outlet:", outlet.id);
  
  try {
    const memberRows = await prisma.staffUser.findMany({
      where: { tenantId: tenant.id, OR: [{ outletId: outlet.id }, { outletId: null }] },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true, role: true, phone: true, active: true, employeeCode: true, payType: true, payRatePaise: true, pinHash: true },
    });
    console.log("memberRows OK:", memberRows.length);
  } catch (e) {
    console.error("Error memberRows:", e);
  }

  try {
    const sales = await prisma.$queryRaw`
      SELECT o."staffId"::text AS "staffId",
             COALESCE(s."name", 'Unattributed') AS name,
             COUNT(*)::int AS orders,
             COALESCE(SUM(o."totalPaise"), 0)::int AS gross
      FROM orders o
      LEFT JOIN staff_users s ON s.id = o."staffId"
      WHERE o."outletId" = ${outlet.id}::uuid
        AND o."status" <> 'cancelled'
        AND o."placedAt" >= now() - interval '30 days'
      GROUP BY 1, 2
      ORDER BY gross DESC
    `;
    console.log("sales OK:", sales);
  } catch (e) {
    console.error("Error sales:", e);
  }

  try {
    const attendance = await prisma.attendance.findMany({
      where: { outletId: outlet.id },
      orderBy: { clockIn: 'desc' },
      take: 12,
      include: { staff: { select: { name: true } } },
    });
    console.log("attendance OK:", attendance.length);
  } catch (e) {
    console.error("Error attendance:", e);
  }

  try {
    const active = await prisma.$queryRaw`
      SELECT s.id::text AS "staffId",
             COALESCE(array_agg(DISTINCT t.label) FILTER (WHERE t.label IS NOT NULL), '{}') AS tables,
             COUNT(DISTINCT o.id)::int AS orders
      FROM orders o
      JOIN staff_users s ON s.id = o."staffId" OR s.id = o."approvedById"
      LEFT JOIN tables_map t ON t.id = o."tableId"
      WHERE o."outletId" = ${outlet.id}::uuid
        AND o."settledAt" IS NULL
        AND o."status" IN ('open','in_kitchen','ready','served')
      GROUP BY s.id
    `;
    console.log("active OK:", active);
  } catch (e) {
    console.error("Error active:", e);
  }

  try {
    const TZ = 'Asia/Kolkata';
    const todayWork = await prisma.$queryRaw`
      SELECT s.id::text AS "staffId",
             COALESCE(ord.orders, 0)::int AS orders,
             COALESCE(ord.gross, 0)::int AS gross,
             COALESCE(al.approvals, 0)::int AS approvals,
             COALESCE(al.settled, 0)::int AS settled,
             COALESCE(al.voided, 0)::int AS voided
      FROM staff_users s
      LEFT JOIN (
        SELECT "staffId", COUNT(*)::int AS orders, COALESCE(SUM("totalPaise"),0)::int AS gross
        FROM orders
        WHERE "outletId" = ${outlet.id}::uuid AND status <> 'cancelled'
          AND ("placedAt" AT TIME ZONE ${TZ})::date = (now() AT TIME ZONE ${TZ})::date
        GROUP BY "staffId"
      ) ord ON ord."staffId" = s.id
      LEFT JOIN (
        SELECT "actorId",
               COUNT(*) FILTER (WHERE action = 'order.approved')::int AS approvals,
               COUNT(*) FILTER (WHERE action = 'table.settled')::int AS settled,
               COUNT(*) FILTER (WHERE action = 'order.item_voided')::int AS voided
        FROM audit_log
        WHERE "outletId" = ${outlet.id}::uuid
          AND ("createdAt" AT TIME ZONE ${TZ})::date = (now() AT TIME ZONE ${TZ})::date
        GROUP BY "actorId"
      ) al ON al."actorId" = s.id
      WHERE s."tenantId" = ${tenant.id}::uuid
    `;
    console.log("todayWork OK:", todayWork);
  } catch (e) {
    console.error("Error todayWork:", e);
  }

  try {
    const TZ = 'Asia/Kolkata';
    const attToday = await prisma.$queryRaw`
      SELECT a."staffId"::text AS "staffId", s.name AS name, a."clockIn" AS "clockIn", a."clockOut" AS "clockOut"
      FROM attendance a JOIN staff_users s ON s.id = a."staffId"
      WHERE a."outletId" = ${outlet.id}::uuid
        AND ("clockIn" AT TIME ZONE ${TZ})::date = (now() AT TIME ZONE ${TZ})::date
      ORDER BY a."clockIn" DESC
    `;
    console.log("attToday OK:", attToday);
  } catch (e) {
    console.error("Error attToday:", e);
  }

  try {
    const shiftRows = await prisma.shift.findMany({
      where: { outletId: outlet.id, endsAt: { gte: new Date() } },
      orderBy: { startsAt: 'asc' },
      take: 60,
      include: { staff: { select: { name: true } } },
    });
    console.log("shiftRows OK:", shiftRows.length);
  } catch (e) {
    console.error("Error shiftRows:", e);
  }

  try {
    const period = new Date().toISOString().slice(0, 7);
    const payRows = await prisma.salaryPayment.findMany({
      where: { outletId: outlet.id, periodLabel: period },
      orderBy: { paidAt: 'desc' },
      select: { id: true, staffId: true, periodLabel: true, amountPaise: true, method: true, paidAt: true },
    });
    console.log("payRows OK:", payRows.length);
  } catch (e) {
    console.error("Error payRows:", e);
  }
}

main().catch(console.error);
