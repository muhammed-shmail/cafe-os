import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

/**
 * ChayaOne — Nuro7 control-plane session (Phase G4).
 *
 * A PlatformAdmin (Level-1) is a SEPARATE principal from staff: separate cookie,
 * separate secret. A staff token can never satisfy this and vice-versa. This
 * module is jose-only (edge-safe) so `middleware.ts` can verify it on the edge —
 * password + TOTP crypto lives in `platform-crypto.ts` (Node only).
 */
export const PLATFORM_COOKIE = 'chayaone_admin';

function secret(): Uint8Array {
  const s = process.env.PLATFORM_JWT_SECRET;
  if (!s) throw new Error('PLATFORM_JWT_SECRET is not set');
  return new TextEncoder().encode(s);
}

export interface PlatformSession extends JWTPayload {
  adminId: string;
  email: string;
  name: string;
  role: string; // PlatformRole
}

export async function signPlatformSession(p: Pick<PlatformSession, 'adminId' | 'email' | 'name' | 'role'>): Promise<string> {
  return new SignJWT({ ...p })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(secret());
}

export async function verifyPlatformSession(token: string): Promise<PlatformSession | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as PlatformSession;
  } catch {
    return null;
  }
}
