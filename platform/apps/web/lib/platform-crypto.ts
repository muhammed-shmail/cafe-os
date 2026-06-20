import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * ChayaOne — control-plane password + TOTP (Phase G4). Node-only (uses
 * `node:crypto`), so never imported by edge middleware. Zero external deps:
 * scrypt for passwords, RFC-6238 TOTP (SHA1/6-digit/30s) for 2FA.
 *
 * Password hash format: `scrypt$<saltHex>$<keyHex>`  (must match the seed).
 */
const KEYLEN = 64;

export function hashPassword(pw: string): string {
  const salt = randomBytes(16);
  const dk = scryptSync(pw, salt, KEYLEN);
  return `scrypt$${salt.toString('hex')}$${dk.toString('hex')}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1]!, 'hex');
  const want = Buffer.from(parts[2]!, 'hex');
  const got = scryptSync(pw, salt, want.length || KEYLEN);
  return want.length === got.length && timingSafeEqual(want, got);
}

// ---- TOTP (RFC 6238) -------------------------------------------------------
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Generate a fresh base32 TOTP secret (default 160-bit). */
export function generateTotpSecret(bytes = 20): string {
  const buf = randomBytes(bytes);
  let bits = '';
  for (const b of buf) bits += b.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

function base32Decode(s: string): Buffer {
  let bits = '';
  for (const ch of s.replace(/=+$/, '').toUpperCase()) {
    const v = B32.indexOf(ch);
    if (v >= 0) bits += v.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', secret).update(buf).digest();
  const off = h[h.length - 1]! & 0x0f;
  const bin =
    ((h[off]! & 0x7f) << 24) | ((h[off + 1]! & 0xff) << 16) | ((h[off + 2]! & 0xff) << 8) | (h[off + 3]! & 0xff);
  return (bin % 1_000_000).toString().padStart(6, '0');
}

/** Verify a 6-digit TOTP token against a base32 secret (±`window` steps for clock skew). */
export function verifyTotp(token: string, secretB32: string, window = 1): boolean {
  if (!/^\d{6}$/.test(token)) return false;
  const secret = base32Decode(secretB32);
  const step = Math.floor(Date.now() / 1000 / 30);
  for (let w = -window; w <= window; w++) {
    if (timingSafeEqual(Buffer.from(hotp(secret, step + w)), Buffer.from(token))) return true;
  }
  return false;
}

/** otpauth:// URL for authenticator-app enrolment (render as QR or enter manually). */
export function totpAuthUrl(secretB32: string, account: string, issuer = 'ChayaOne'): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  return `otpauth://totp/${label}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
