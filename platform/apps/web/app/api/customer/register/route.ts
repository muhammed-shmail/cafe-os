import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@cafeos/db';
import { resolveTable, CUSTOMER_COOKIE } from '@/lib/customer';
import { hashPhone, normalizePhone, isValidPhone } from '@/lib/phone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/customer/register — capture name + mobile for the PWA.
 *
 * Returning customers are recognised by `phoneHash` (no OTP). We find-or-create
 * a Customer for the table's tenant, set the `cafeos_cust` cookie (same options
 * used across the customer APIs) and return a loyalty snapshot. Purely additive:
 * `resolveCustomerId` still falls back to the demo customer when no cookie is
 * set, so existing flows are untouched.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const table = await resolveTable(body.t ?? null);
  if (!table) return NextResponse.json({ error: 'table_not_found' }, { status: 404 });
  const tenantId = table.outlet.tenantId;

  const phone = normalizePhone(String(body.phone ?? ''));
  if (!isValidPhone(phone)) return NextResponse.json({ error: 'invalid_phone' }, { status: 400 });
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 60) : null;
  const phoneHash = hashPhone(phone);
  const fp = String(body.fingerprint ?? '').slice(0, 120) || null;

  const existing = await prisma.customer.findFirst({ where: { tenantId, phoneHash }, select: { id: true, name: true, deviceFingerprints: true } });

  let customerId: string;
  if (existing) {
    customerId = existing.id;
    await prisma.customer.update({
      where: { id: existing.id },
      data: {
        // keep an existing name unless the guest provides a new one
        name: name || existing.name || undefined,
        phone,
        lastVisit: new Date(),
        deviceFingerprints: fp && !existing.deviceFingerprints.includes(fp) ? { push: fp } : undefined,
      },
    });
  } else {
    const now = new Date();
    const created = await prisma.customer.create({
      data: { tenantId, name, phone, phoneHash, deviceFingerprints: fp ? [fp] : [], source: 'pwa', firstVisit: now, lastVisit: now },
      select: { id: true },
    });
    customerId = created.id;
  }

  const c = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { name: true, tier: true, points: true, coins: true, visitCount: true, referralCode: true },
  });

  const res = NextResponse.json({
    ok: true,
    customer: c ? { name: c.name ?? 'Guest', tier: c.tier, points: c.points, coins: c.coins, visits: c.visitCount, referral: c.referralCode, registered: true } : null,
  });
  res.cookies.set(CUSTOMER_COOKIE, customerId, { httpOnly: false, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 90 });
  return res;
}
