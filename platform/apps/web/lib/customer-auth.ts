import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Customer identity for the PWA (Phase 2).
 *
 * The customer "session" is a signed JWT in the `cafeos_cust` cookie — the same
 * primitive staff use (see `lib/auth.ts`), so a device can no longer be
 * impersonated by pasting a customer UUID into a cookie (the pre-Phase-2 scheme).
 *
 * Login is phone + OTP. The OTP challenge is *stateless*: instead of a DB table,
 * we mint a short-lived signed `cafeos_otp` cookie carrying the phone hash, the
 * tenant and a hash of the code. Verify reads it back, so the code can only be
 * redeemed on the device that requested it (ideal for a table-side PWA) and no
 * migration is needed. Failed attempts decrement a counter inside the re-issued
 * cookie, capping brute force without server state.
 *
 * jose-only crypto means these helpers are edge-safe; the sha256 code hash uses
 * `node:crypto`, so the OTP routes that call it stay on the node runtime.
 */
export const CUSTOMER_COOKIE = 'cafeos_cust';
export const OTP_COOKIE = 'cafeos_otp';

export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days — returning auto-login
export const OTP_TTL_SECONDS = 5 * 60; // 5 minutes
export const MAX_OTP_TRIES = 5;

function secret(): Uint8Array {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET is not set');
  return new TextEncoder().encode(s);
}

// ---- customer session ------------------------------------------------------
export interface CustomerSession extends JWTPayload {
  sub: string; // customerId
  tid: string; // tenantId
}

export async function signCustomerSession(customerId: string, tenantId: string): Promise<string> {
  return new SignJWT({ tid: tenantId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(customerId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret());
}

export async function verifyCustomerSession(token: string): Promise<CustomerSession | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (typeof payload.sub !== 'string' || typeof (payload as CustomerSession).tid !== 'string') return null;
    return payload as CustomerSession;
  } catch {
    return null;
  }
}

// ---- stateless OTP challenge ------------------------------------------------
export interface OtpChallenge extends JWTPayload {
  ph: string; // phoneHash
  tid: string; // tenantId
  ch: string; // code hash
  tries: number; // remaining attempts
}

/** Hash an OTP code (peppered with the app secret) so the cookie never carries it in the clear. */
export function hashOtpCode(code: string): string {
  return createHash('sha256').update(`${code}:${process.env.JWT_SECRET ?? ''}`).digest('hex');
}

/** Constant-time compare of a submitted code against a stored hash. */
export function verifyOtpCode(code: string, storedHash: string): boolean {
  const got = Buffer.from(hashOtpCode(code), 'hex');
  const want = Buffer.from(storedHash, 'hex');
  return got.length === want.length && timingSafeEqual(got, want);
}

/**
 * Sign an OTP challenge cookie. Pass `expSeconds` (absolute, epoch seconds) to
 * preserve the original window when re-issuing after a wrong attempt — otherwise
 * the clock would reset on every retry.
 */
export async function signOtpChallenge(
  c: Pick<OtpChallenge, 'ph' | 'tid' | 'ch' | 'tries'>,
  expSeconds?: number,
): Promise<string> {
  return new SignJWT({ ph: c.ph, tid: c.tid, ch: c.ch, tries: c.tries })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expSeconds ?? `${OTP_TTL_SECONDS}s`)
    .sign(secret());
}

export async function verifyOtpChallenge(token: string): Promise<OtpChallenge | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    const p = payload as OtpChallenge;
    if (typeof p.ph !== 'string' || typeof p.tid !== 'string' || typeof p.ch !== 'string') return null;
    return p;
  } catch {
    return null;
  }
}
