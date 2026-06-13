import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { cookies } from 'next/headers';

/**
 * Cafe OS — session helpers. A signed JWT in an httpOnly cookie carries the
 * authenticated staff member + their tenant/outlet. Everything downstream
 * (order attribution, tenant scoping / RLS context) reads from here.
 */
export const SESSION_COOKIE = 'cafeos_session';

export interface Session extends JWTPayload {
  staffId: string;
  name: string;
  role: string;
  tenantId: string;
  outletId: string;
}

function secret(): Uint8Array {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET is not set');
  return new TextEncoder().encode(s);
}

export async function signSession(payload: Omit<Session, keyof JWTPayload>): Promise<string> {
  return new SignJWT(payload as JWTPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('12h') // a shift
    .sign(secret());
}

export async function verifySession(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as Session;
  } catch {
    return null;
  }
}

/** Read the current session from cookies (server components / route handlers). */
export async function getSession(): Promise<Session | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}
