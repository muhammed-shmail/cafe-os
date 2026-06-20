import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@cafeos/db';
import { resolveTable } from '@/lib/customer';
import { hashPhone, normalizePhone, isValidPhone } from '@/lib/phone';
import {
  signCustomerSession,
  signOtpChallenge,
  verifyOtpChallenge,
  verifyOtpCode,
  CUSTOMER_COOKIE,
  OTP_COOKIE,
  OTP_TTL_SECONDS,
  SESSION_TTL_SECONDS,
} from '@/lib/customer-auth';
import { assertSlot, bumpUsage, SlotExceeded } from '@/lib/limits';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const isProd = process.env.NODE_ENV === 'production';

/**
 * POST /api/customer/otp/verify — step 2: redeem the code, issue a session.
 *
 * On success the device gets a signed `cafeos_cust` session cookie (90d, so the
 * next visit auto-logs in). Returning customers come back fully resolved and
 * `needsName: false`; brand-new ones are created and asked for a name (step 3).
 * Wrong codes decrement the attempt counter inside the re-issued challenge cookie
 * — when it hits zero the challenge is burned and the caller must start over.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const table = await resolveTable(body.t ?? null);
  if (!table) return NextResponse.json({ error: 'table_not_found' }, { status: 404 });
  const tenantId = table.outlet.tenantId;

  const phone = normalizePhone(String(body.phone ?? ''));
  if (!isValidPhone(phone)) return NextResponse.json({ error: 'invalid_phone' }, { status: 400 });
  const code = String(body.code ?? '').replace(/\D/g, '').slice(0, 6);

  const token = req.cookies.get(OTP_COOKIE)?.value;
  const ch = token ? await verifyOtpChallenge(token) : null;
  // Missing/expired challenge, or it belongs to a different phone/tenant → resend.
  if (!ch || ch.tid !== tenantId || ch.ph !== hashPhone(phone)) {
    const res = NextResponse.json({ error: 'otp_expired' }, { status: 400 });
    res.cookies.delete(OTP_COOKIE);
    return res;
  }

  if (!verifyOtpCode(code, ch.ch)) {
    await new Promise((r) => setTimeout(r, 250)); // blunt brute force
    const remaining = (ch.tries ?? 1) - 1;
    if (remaining <= 0) {
      const res = NextResponse.json({ error: 'too_many_attempts' }, { status: 400 });
      res.cookies.delete(OTP_COOKIE);
      return res;
    }
    // Re-issue the challenge with one fewer attempt, preserving the original window.
    const next = await signOtpChallenge({ ph: ch.ph, tid: ch.tid, ch: ch.ch, tries: remaining }, ch.exp);
    const res = NextResponse.json({ error: 'invalid_code', remaining }, { status: 400 });
    res.cookies.set(OTP_COOKIE, next, { httpOnly: true, sameSite: 'lax', secure: isProd, path: '/', maxAge: OTP_TTL_SECONDS });
    return res;
  }

  // --- code is valid: find-or-create the customer (mirrors /register) --------
  const phoneHash = hashPhone(phone);
  const fp = String(body.fingerprint ?? '').slice(0, 120) || null;
  const existing = await prisma.customer.findFirst({ where: { tenantId, phoneHash }, select: { id: true, name: true, deviceFingerprints: true } });

  let customerId: string;
  let isNew = false;
  if (existing) {
    customerId = existing.id;
    await prisma.customer.update({
      where: { id: existing.id },
      data: {
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
      data: { tenantId, phone, phoneHash, deviceFingerprints: fp ? [fp] : [], source: 'pwa', firstVisit: now, lastVisit: now },
      select: { id: true },
    });
    customerId = created.id;
    isNew = true;
    await bumpUsage(tenantId, 'customers').catch(() => {});
  }

  const c = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { name: true, tier: true, points: true, coins: true, visitCount: true, referralCode: true },
  });

  const session = await signCustomerSession(customerId, tenantId);
  const res = NextResponse.json({
    ok: true,
    isNew,
    needsName: !c?.name, // step 3 prompts for a name when we don't have one yet
    customer: c ? { name: c.name ?? 'Guest', tier: c.tier, points: c.points, coins: c.coins, visits: c.visitCount, referral: c.referralCode, registered: true } : null,
  });
  res.cookies.set(CUSTOMER_COOKIE, session, { httpOnly: true, sameSite: 'lax', secure: isProd, path: '/', maxAge: SESSION_TTL_SECONDS });
  res.cookies.delete(OTP_COOKIE);
  return res;
}
