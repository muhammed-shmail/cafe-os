import { createHash } from 'node:crypto';

/**
 * Phone helpers (server-only).
 *
 * `phoneHash` lets us recognise a returning customer without storing/looking up
 * raw phone numbers in the clear. Matches the scheme used by the seed
 * (`sha256(digits)` hex) so existing seeded customers resolve correctly.
 */

/** Keep only digits, drop a leading country code's +, cap length. */
export function normalizePhone(raw: string): string {
  return String(raw ?? '').replace(/\D/g, '').slice(-15);
}

export function hashPhone(raw: string): string {
  return createHash('sha256').update(normalizePhone(raw)).digest('hex');
}

/** Basic validity: 8–15 digits after normalization. */
export function isValidPhone(raw: string): boolean {
  const d = normalizePhone(raw);
  return d.length >= 8 && d.length <= 15;
}
