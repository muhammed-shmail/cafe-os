import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { prisma, type Prisma, type StaffRole } from '@cafeos/db';
import { getSession } from '@/lib/auth';
import { canManageStaff, assignableRoles, canManageTarget, ALL_ROLES } from '@/lib/rbac';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const isRole = (r: unknown): r is StaffRole => typeof r === 'string' && (ALL_ROLES as string[]).includes(r);
const hashPin = (pin: string) => createHash('sha256').update(pin).digest('hex');

/** GET /api/staff — staff users for the tenant (manager/owner only). */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!canManageStaff(session.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const rows = await prisma.staffUser.findMany({
    where: { tenantId: session.tenantId },
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
    select: { id: true, name: true, role: true, phone: true, active: true, employeeCode: true, payType: true, payRatePaise: true, pinHash: true },
  });
  const members = rows.map(({ pinHash, ...m }) => ({ ...m, hasPin: !!pinHash }));
  return NextResponse.json({ members, assignable: assignableRoles(session.role) });
}

/**
 * POST /api/staff — manage staff users.
 *  { action: 'create', name, role, phone?, pin }
 *  { action: 'update', id, role?, active? }
 *  { action: 'setpin', id, pin }
 *  { action: 'remove', id }   // soft-delete (active=false) to preserve order history
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!canManageStaff(session.role)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { action } = body;

  if (action === 'create') {
    const { name, role, phone, pin, employeeCode } = body;
    if (!name?.trim() || !isRole(role)) return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
    if (!assignableRoles(session.role).includes(role)) return NextResponse.json({ error: 'role_not_allowed' }, { status: 403 });
    if (!/^\d{4,6}$/.test(String(pin ?? ''))) return NextResponse.json({ error: 'pin_must_be_4_to_6_digits' }, { status: 400 });

    const pinHash = hashPin(String(pin));
    const clash = await prisma.staffUser.findFirst({ where: { pinHash }, select: { id: true } });
    if (clash) return NextResponse.json({ error: 'pin_in_use' }, { status: 409 });

    const created = await prisma.staffUser.create({
      data: {
        tenantId: session.tenantId,
        outletId: session.outletId,
        name: String(name).trim(),
        phone: phone ? String(phone).trim() : null,
        employeeCode: employeeCode ? String(employeeCode).trim() : null,
        role,
        pinHash,
        active: true,
      },
      select: { id: true, name: true, role: true, phone: true, active: true, employeeCode: true, payType: true, payRatePaise: true },
    });
    await audit(session, 'staff.created', created.id, { name: created.name, role: created.role });
    return NextResponse.json({ ok: true, member: { ...created, hasPin: true } });
  }

  // ---- shifts (roster) — subject is body.staffId ----
  if (action === 'shift_add' || action === 'shift_remove') {
    if (action === 'shift_remove') {
      if (!body.shiftId) return NextResponse.json({ error: 'missing_id' }, { status: 400 });
      await prisma.shift.deleteMany({ where: { id: body.shiftId, outletId: session.outletId } });
      return NextResponse.json({ ok: true });
    }
    const { staffId, startsAt, endsAt, role } = body;
    const staff = await prisma.staffUser.findFirst({ where: { id: staffId, tenantId: session.tenantId }, select: { id: true } });
    if (!staff) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const start = new Date(startsAt), end = new Date(endsAt);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) return NextResponse.json({ error: 'invalid_times' }, { status: 400 });
    const shift = await prisma.shift.create({
      data: { outletId: session.outletId, staffId, startsAt: start, endsAt: end, role: role ? String(role) : null, status: 'scheduled' },
      select: { id: true, staffId: true, startsAt: true, endsAt: true, role: true },
    });
    await audit(session, 'shift.added', staffId, { shiftId: shift.id, startsAt, endsAt });
    return NextResponse.json({ ok: true, shift });
  }

  // all remaining actions target an existing user
  const { id } = body;
  if (!id) return NextResponse.json({ error: 'missing_id' }, { status: 400 });
  const target = await prisma.staffUser.findFirst({ where: { id, tenantId: session.tenantId } });
  if (!target) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (!canManageTarget(session.role, target.role)) return NextResponse.json({ error: 'cannot_manage_this_user' }, { status: 403 });

  if (action === 'update') {
    const data: Prisma.StaffUserUpdateInput = {};
    if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim();
    if (body.phone !== undefined) data.phone = body.phone ? String(body.phone).trim() : null;
    if (body.employeeCode !== undefined) data.employeeCode = body.employeeCode ? String(body.employeeCode).trim() : null;
    if (body.role !== undefined) {
      if (!isRole(body.role) || !assignableRoles(session.role).includes(body.role)) {
        return NextResponse.json({ error: 'role_not_allowed' }, { status: 403 });
      }
      data.role = body.role;
    }
    if (body.active !== undefined) {
      // never let an admin lock themselves out
      if (id === session.staffId && body.active === false) {
        return NextResponse.json({ error: 'cannot_deactivate_self' }, { status: 400 });
      }
      data.active = !!body.active;
    }
    const updated = await prisma.staffUser.update({ where: { id }, data, select: { id: true, name: true, role: true, phone: true, active: true, employeeCode: true, payType: true, payRatePaise: true } });
    await audit(session, 'staff.updated', id, { role: updated.role, active: updated.active });
    return NextResponse.json({ ok: true, member: { ...updated, hasPin: !!target.pinHash } });
  }

  // ---- pay configuration (rate + employee code) ----
  if (action === 'set_pay') {
    const payType = body.payType === 'monthly' || body.payType === 'hourly' ? body.payType : null;
    const rate = body.payRatePaise === null || body.payRatePaise === undefined ? null : Math.round(Number(body.payRatePaise));
    if (rate !== null && (!Number.isFinite(rate) || rate < 0)) return NextResponse.json({ error: 'invalid_rate' }, { status: 400 });
    const data: Prisma.StaffUserUpdateInput = { payType, payRatePaise: rate };
    if (body.employeeCode !== undefined) data.employeeCode = body.employeeCode ? String(body.employeeCode).trim() : null;
    const updated = await prisma.staffUser.update({ where: { id }, data, select: { id: true, name: true, role: true, phone: true, active: true, employeeCode: true, payType: true, payRatePaise: true } });
    await audit(session, 'staff.pay_set', id, { payType, payRatePaise: rate });
    return NextResponse.json({ ok: true, member: { ...updated, hasPin: !!target.pinHash } });
  }

  // ---- record a salary / wage payment ----
  if (action === 'pay_record') {
    const amountPaise = Math.round(Number(body.amountPaise));
    if (!Number.isFinite(amountPaise) || amountPaise <= 0) return NextResponse.json({ error: 'invalid_amount' }, { status: 400 });
    const method = ['cash', 'upi', 'bank'].includes(body.method) ? body.method : 'cash';
    const periodLabel = String(body.periodLabel ?? '').trim() || new Date().toISOString().slice(0, 7);
    const pay = await prisma.salaryPayment.create({
      data: { outletId: session.outletId, staffId: id, periodLabel, amountPaise, method, note: body.note ? String(body.note).trim() : null, createdById: session.staffId },
      select: { id: true, periodLabel: true, amountPaise: true, method: true, paidAt: true },
    });
    await audit(session, 'staff.salary_paid', id, { periodLabel, amountPaise, method });
    return NextResponse.json({ ok: true, payment: pay });
  }

  if (action === 'setpin') {
    if (!/^\d{4,6}$/.test(String(body.pin ?? ''))) return NextResponse.json({ error: 'pin_must_be_4_to_6_digits' }, { status: 400 });
    const pinHash = hashPin(String(body.pin));
    const clash = await prisma.staffUser.findFirst({ where: { pinHash, NOT: { id } }, select: { id: true } });
    if (clash) return NextResponse.json({ error: 'pin_in_use' }, { status: 409 });
    await prisma.staffUser.update({ where: { id }, data: { pinHash } });
    await audit(session, 'staff.pin_reset', id, {});
    return NextResponse.json({ ok: true });
  }

  if (action === 'remove') {
    if (id === session.staffId) return NextResponse.json({ error: 'cannot_remove_self' }, { status: 400 });
    // soft-delete: deactivate so historical orders keep their attribution
    const updated = await prisma.staffUser.update({ where: { id }, data: { active: false }, select: { id: true, name: true, role: true, phone: true, active: true } });
    await audit(session, 'staff.removed', id, { name: updated.name });
    return NextResponse.json({ ok: true, member: updated });
  }

  return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
}

async function audit(session: { outletId: string; staffId: string }, action: string, entityId: string, after: Record<string, unknown>) {
  await prisma.auditLog.create({
    data: { outletId: session.outletId, actorId: session.staffId, action, entity: 'staff_user', entityId, after: after as Prisma.InputJsonValue },
  }).catch(() => {});
}
