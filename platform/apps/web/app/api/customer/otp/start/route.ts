import { NextRequest, NextResponse } from 'next/server';
import { randomInt } from 'node:crypto';
import { resolveTable } from '@/lib/customer';
import { hashPhone, normalizePhone, isValidPhone } from '@/lib/phone';
import { signOtpChallenge, hashOtpCode, OTP_COOKIE, OTP_TTL_SECONDS, MAX_OTP_TRIES } from '@/lib/customer-auth';
import { sendOtp, otpDevEcho } from '@/lib/otp-sender';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/customer/otp/start — step 1 of onboarding: request a login code.
 *
 * Mints a 6-digit code, hands it to the (dev-scaffold) sender, and stores a
 * short-lived signed challenge in the `cafeos_otp` cookie. We deliberately do
 * NOT reveal whether the phone is a known customer here — that would let anyone
 * enumerate the customer base. The new/returning distinction is made at /verify,
 * after the caller proves they received the code.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const table = await resolveTable(body.t ?? null);
  if (!table) return NextResponse.json({ error: 'table_not_found' }, { status: 404 });
  const tenantId = table.outlet.tenantId;

  const phone = normalizePhone(String(body.phone ?? ''));
  if (!isValidPhone(phone)) return NextResponse.json({ error: 'invalid_phone' }, { status: 400 });

  const code = String(randomInt(100000, 1000000)); // always 6 digits
  const token = await signOtpChallenge({ ph: hashPhone(phone), tid: tenantId, ch: hashOtpCode(code), tries: MAX_OTP_TRIES });
  const sent = await sendOtp(phone, code);

  const res = NextResponse.json({ ok: true, channel: sent.channel, ...(otpDevEcho() ? { devCode: code } : {}) });
  res.cookies.set(OTP_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: OTP_TTL_SECONDS,
  });
  return res;
}
