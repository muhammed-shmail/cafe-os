import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@cafeos/db';
import { resolveTable } from '@/lib/customer';
import { signCustomerSession, CUSTOMER_COOKIE, SESSION_TTL_SECONDS } from '@/lib/customer-auth';
import { hashPhone, normalizePhone, isValidPhone } from '@/lib/phone';
import { assertSlot, bumpUsage, SlotExceeded } from '@/lib/limits';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/customer/register — name + mobile capture (no-OTP path).
 *
 * The fast path is OTP login (see `/api/customer/otp/*`); this remains for owners
 * who want a frictionless name+mobile gate. Returning customers are recognised by
 * `phoneHash`. We find-or-create a Customer, issue a signed `cafeos_cust` session
 * (Phase 2 — no longer a spoofable raw UUID) and return a loyalty snapshot.
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
    // slot enforcement (G6): customer cap per plan (new sign-ups only)
    try {
      await assertSlot(tenantId, 'customers');
    } catch (e) {
      if (e instanceof SlotExceeded) return NextResponse.json({ error: 'slot_exceeded', metric: e.metric, limit: e.limit, upsell: true }, { status: 402 });
      throw e;
    }
    const now = new Date();
    const created = await prisma.customer.create({
      data: { tenantId, name, phone, phoneHash, deviceFingerprints: fp ? [fp] : [], source: 'pwa', firstVisit: now, lastVisit: now },
      select: { id: true },
    });
    customerId = created.id;
    await bumpUsage(tenantId, 'customers').catch(() => {});
  }

  const c = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { name: true, tier: true, points: true, coins: true, visitCount: true, referralCode: true },
  });

  const session = await signCustomerSession(customerId, tenantId);
  const res = NextResponse.json({
    ok: true,
    customer: c ? { name: c.name ?? 'Guest', tier: c.tier, points: c.points, coins: c.coins, visits: c.visitCount, referral: c.referralCode, registered: true } : null,
  });
  res.cookies.set(CUSTOMER_COOKIE, session, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
  return res;
}
