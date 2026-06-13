/**
 * Spin-the-Wheel — single source of truth for segments, shared by the server
 * (authoritative pick) and the client (render + animate to the chosen index).
 * The client NEVER decides the prize; it only animates to the index the server
 * returns. That's the core anti-cheat guarantee.
 *
 * NOTE: this module is imported by the client (to render the wheel), so it must
 * stay free of Node built-ins. The crypto-backed pick lives server-side in
 * api/customer/spin (it imports node:crypto there).
 */
export type WheelSegment = {
  label: string;
  kind: 'coins' | 'coupon' | 'none';
  value: number | string;
  color: string;
  weight: number; // relative probability
};

export const WHEEL: WheelSegment[] = [
  { label: '+20 coins', kind: 'coins', value: 20, color: '#E8902A', weight: 26 },
  { label: 'Free Cookie', kind: 'coupon', value: 'Free Cookie', color: '#4E7A4A', weight: 10 },
  { label: '+5 coins', kind: 'coins', value: 5, color: '#D9A93A', weight: 30 },
  { label: '₹30 off', kind: 'coupon', value: '₹30 off', color: '#C3492F', weight: 12 },
  { label: 'Try again', kind: 'none', value: 0, color: '#9A8473', weight: 14 },
  { label: '+50 coins', kind: 'coins', value: 50, color: '#8E3B6B', weight: 8 },
];

export const WHEEL_TOTAL_WEIGHT = WHEEL.reduce((s, w) => s + w.weight, 0);

/** Pure weighted pick from a caller-supplied random integer in [0, WHEEL_TOTAL_WEIGHT). */
export function pickIndex(rand: number): number {
  let r = rand;
  for (let i = 0; i < WHEEL.length; i++) {
    if (r < WHEEL[i]!.weight) return i;
    r -= WHEEL[i]!.weight;
  }
  return WHEEL.length - 1;
}
