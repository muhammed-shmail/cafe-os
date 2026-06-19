import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@cafeos/db';
import { getSession } from '@/lib/auth';
import { hashPhone, normalizePhone, isValidPhone } from '@/lib/phone';
import { getOutletPwa, paiseToPoints } from '@/lib/pwa';
import { listCustomers, getCustomerAnalytics, type CustomerFilter } from '@/lib/crm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Customer Management & Loyalty CRM — list + admin mutations.
 *
 * Owner/manager only, tenant-scoped. Loyalty/wallet edits go through the
 * append-only `LoyaltyLedger` (type `adjust`/`expire`) AND an `AuditLog` row
 * carrying actor + before/after + reason. "Wallet credit" is points under the
 * outlet's conversion rate — there is no separate money balance.
 */

const GENDERS = ['male', 'female', 'other'];
const STATUSES = ['active', 'inactive', 'blocked'];

function parseDate(v: unknown): Date | null {
  if (typeof v !== 'string' || !v.trim()) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
function cleanStr(v: unknown, max = 200): string | null {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (session.role !== 'owner' && session.role !== 'manager')
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const sp = req.nextUrl.searchParams;
  const search = sp.get('search') ?? '';
  const filter = (sp.get('filter') ?? 'all') as CustomerFilter;
  const page = Number(sp.get('page') ?? '1') || 1;

  const [list, analytics] = await Promise.all([
    listCustomers(session.tenantId, session.outletId, { search, filter, page }),
    getCustomerAnalytics(session.tenantId),
  ]);
  return NextResponse.json({ ...list, analytics });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (session.role !== 'owner' && session.role !== 'manager')
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { tenantId, outletId, staffId } = session;

  try {
    const body = await req.json();
    const { action } = body;

    // ---------------- manual add ----------------
    if (action === 'create') {
      const phone = normalizePhone(String(body.phone ?? ''));
      if (!isValidPhone(phone)) return NextResponse.json({ error: 'invalid_phone' }, { status: 400 });
      const phoneHash = hashPhone(phone);
      const dup = await prisma.customer.findFirst({ where: { tenantId, phoneHash }, select: { id: true } });
      if (dup) return NextResponse.json({ error: 'customer_exists', id: dup.id }, { status: 409 });

      const gender = cleanStr(body.gender, 12);
      const created = await prisma.customer.create({
        data: {
          tenantId,
          name: cleanStr(body.name, 80),
          phone,
          phoneHash,
          email: cleanStr(body.email, 120),
          gender: gender && GENDERS.includes(gender) ? gender : null,
          address: cleanStr(body.address, 300),
          notes: cleanStr(body.notes, 500),
          birthday: parseDate(body.birthday),
          source: 'manual',
          firstVisit: new Date(),
        },
        select: { id: true },
      });
      return NextResponse.json({ ok: true, id: created.id });
    }

    // ---------------- edit personal fields ----------------
    if (action === 'update') {
      const cust = await prisma.customer.findFirst({ where: { id: body.id, tenantId }, select: { id: true } });
      if (!cust) return NextResponse.json({ error: 'not_found' }, { status: 404 });
      const gender = cleanStr(body.gender, 12);
      await prisma.customer.update({
        where: { id: cust.id },
        data: {
          name: cleanStr(body.name, 80),
          email: cleanStr(body.email, 120),
          gender: gender && GENDERS.includes(gender) ? gender : null,
          address: cleanStr(body.address, 300),
          notes: cleanStr(body.notes, 500),
          birthday: parseDate(body.birthday),
        },
      });
      return NextResponse.json({ ok: true });
    }

    // ---------------- status ----------------
    if (action === 'set_status') {
      const status = String(body.status ?? '');
      if (!STATUSES.includes(status)) return NextResponse.json({ error: 'invalid_status' }, { status: 400 });
      const cust = await prisma.customer.findFirst({ where: { id: body.id, tenantId }, select: { id: true, status: true } });
      if (!cust) return NextResponse.json({ error: 'not_found' }, { status: 404 });
      await prisma.$transaction([
        prisma.customer.update({ where: { id: cust.id }, data: { status: status as any } }),
        prisma.auditLog.create({
          data: {
            outletId, actorId: staffId, action: 'customer.set_status', entity: 'customer', entityId: cust.id,
            before: { status: cust.status }, after: { status, reason: cleanStr(body.reason, 200) },
          },
        }),
      ]);
      return NextResponse.json({ ok: true });
    }

    // ---------------- points & wallet adjustments ----------------
    const POINT_ACTIONS: Record<string, { ledgerType: 'adjust' | 'expire'; source: string; sign: -1 | 1; wallet?: boolean; reset?: boolean }> = {
      points_add: { ledgerType: 'adjust', source: 'admin', sign: 1 },
      points_deduct: { ledgerType: 'adjust', source: 'admin', sign: -1 },
      points_reset: { ledgerType: 'adjust', source: 'admin', sign: -1, reset: true },
      points_transfer: { ledgerType: 'adjust', source: 'admin_promo', sign: 1 },
      wallet_add: { ledgerType: 'adjust', source: 'admin_wallet', sign: 1, wallet: true },
      wallet_remove: { ledgerType: 'adjust', source: 'admin_wallet', sign: -1, wallet: true },
      wallet_expire: { ledgerType: 'expire', source: 'admin_wallet', sign: -1, wallet: true },
    };

    const spec = POINT_ACTIONS[action];
    if (spec) {
      const cust = await prisma.customer.findFirst({ where: { id: body.id, tenantId }, select: { id: true, points: true } });
      if (!cust) return NextResponse.json({ error: 'not_found' }, { status: 404 });

      // magnitude: wallet ops accept ₹ paise (converted to points); point ops accept points
      let magnitude: number;
      if (spec.reset) {
        magnitude = cust.points;
      } else if (spec.wallet) {
        const cfg = await getOutletPwa(outletId);
        const amountPaise = Math.round(Number(body.amountPaise ?? 0));
        if (!Number.isFinite(amountPaise) || amountPaise <= 0) return NextResponse.json({ error: 'invalid_amount' }, { status: 400 });
        magnitude = paiseToPoints(amountPaise, cfg);
      } else {
        magnitude = Math.round(Number(body.points ?? 0));
        if (!Number.isFinite(magnitude) || magnitude <= 0) return NextResponse.json({ error: 'invalid_points' }, { status: 400 });
      }

      const before = cust.points;
      const after = Math.max(0, before + spec.sign * magnitude);
      const delta = after - before; // signed, after clamping at 0
      // ledger row: expire stores a positive magnitude (a debit); adjust stores the signed delta
      const ledgerPoints = spec.ledgerType === 'expire' ? Math.abs(delta) : delta;

      await prisma.$transaction([
        prisma.customer.update({ where: { id: cust.id }, data: { points: after } }),
        prisma.loyaltyLedger.create({
          data: { customerId: cust.id, outletId, type: spec.ledgerType, points: ledgerPoints, source: spec.source },
        }),
        prisma.auditLog.create({
          data: {
            outletId, actorId: staffId, action: `customer.${action}`, entity: 'customer', entityId: cust.id,
            before: { points: before }, after: { points: after, delta, reason: cleanStr(body.reason, 200) },
          },
        }),
      ]);
      return NextResponse.json({ ok: true, points: after });
    }

    // ---------------- bulk import ----------------
    if (action === 'import') {
      const rows: any[] = Array.isArray(body.rows) ? body.rows.slice(0, 2000) : [];
      let created = 0, skipped = 0, invalid = 0;
      for (const r of rows) {
        const phone = normalizePhone(String(r.phone ?? ''));
        if (!isValidPhone(phone)) { invalid++; continue; }
        const phoneHash = hashPhone(phone);
        const exists = await prisma.customer.findFirst({ where: { tenantId, phoneHash }, select: { id: true } });
        if (exists) { skipped++; continue; }
        const gender = cleanStr(r.gender, 12);
        await prisma.customer.create({
          data: {
            tenantId, name: cleanStr(r.name, 80), phone, phoneHash,
            email: cleanStr(r.email, 120),
            gender: gender && GENDERS.includes(gender) ? gender : null,
            address: cleanStr(r.address, 300), notes: cleanStr(r.notes, 500),
            birthday: parseDate(r.birthday), source: 'import',
          },
        });
        created++;
      }
      return NextResponse.json({ ok: true, created, skipped, invalid });
    }

    return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
  } catch (e: any) {
    console.error('Customer operation failed:', e);
    return NextResponse.json({ error: e.message ?? 'failed' }, { status: 500 });
  }
}
