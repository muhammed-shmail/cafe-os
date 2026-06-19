/**
 * Cafe OS — table QR helpers (client-safe, no server imports).
 *
 * Every table carries a unique `qrToken`. The customer PWA opens at
 * `/app?t=<qrToken>` (see app/app/page.tsx → resolveTable), so the QR a guest
 * scans simply encodes that absolute URL.
 *
 * The QR bitmap is rendered by a public, stateless image endpoint. The encoded
 * payload is a *public* table URL (it's literally printed on the table), so
 * nothing sensitive leaves the browser. Swap `qrImageUrl` for an offline
 * generator here if a fully air-gapped deployment is ever required — it's the
 * single seam the rest of the app depends on.
 */

/** Absolute customer-ordering URL for a table token, e.g. https://host/app?t=abc */
export function tableOrderUrl(qrToken: string, origin?: string): string {
  const base = origin ?? (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base}/app?t=${encodeURIComponent(qrToken)}`;
}

/** A PNG QR image URL encoding `data`, sized `size`×`size` px. */
export function qrImageUrl(data: string, size = 240): string {
  const s = Math.max(80, Math.min(1000, Math.round(size)));
  return `https://api.qrserver.com/v1/create-qr-code/?size=${s}x${s}&margin=8&data=${encodeURIComponent(data)}`;
}

/** QR image for a table token at a given pixel size. */
export function tableQrImageUrl(qrToken: string, size = 240, origin?: string): string {
  return qrImageUrl(tableOrderUrl(qrToken, origin), size);
}
