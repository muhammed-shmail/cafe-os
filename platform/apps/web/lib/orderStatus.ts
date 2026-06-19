/**
 * Cafe OS — order/KOT status design system (Petpooja-inspired).
 *
 * One source of truth for how every kitchen/order stage is *named* and
 * *colour-coded*, so the POS, the KDS ticket and any status pill agree.
 *
 * Petpooja convention used here:
 *   New      → blue    (just landed, needs the kitchen to accept it)
 *   Preparing→ amber   (accepted, on the pass)
 *   Ready    → green   (cook done, waiting to be served / picked up)
 *   Served   → teal    (handed to the guest / out the door)
 *
 * `new` is a KDS-only display stage: the order is `in_kitchen` on the server
 * but hasn't been acknowledged on the screen yet. Everything else maps 1:1 to
 * the persisted OrderStatus.
 */

export type KdsStage = 'new' | 'preparing' | 'ready' | 'served';

export type StageStyle = {
  /** stage key */
  key: KdsStage;
  /** short label shown on the badge */
  label: string;
  /** the verb the bump button shows to move *into the next* stage */
  action: string;
  /** primary colour (border / dot / badge text) */
  color: string;
  /** translucent badge background */
  bg: string;
};

export const STAGES: Record<KdsStage, StageStyle> = {
  new: {
    key: 'new',
    label: 'New',
    action: 'Accept',
    color: '#3B82F6',
    bg: 'rgba(59,130,246,.16)',
  },
  preparing: {
    key: 'preparing',
    label: 'Preparing',
    action: 'Ready ✓',
    color: '#E8A22B',
    bg: 'rgba(232,162,43,.18)',
  },
  ready: {
    key: 'ready',
    label: 'Ready',
    action: 'Serve →',
    color: '#34C759',
    bg: 'rgba(52,199,89,.16)',
  },
  served: {
    key: 'served',
    label: 'Served',
    action: 'Done',
    color: '#14B8A6',
    bg: 'rgba(20,184,166,.16)',
  },
};

/** legend order, for the colour key strip at the top of the KDS */
export const STAGE_ORDER: KdsStage[] = ['new', 'preparing', 'ready', 'served'];

/**
 * Resolve the *display* stage for a ticket.
 * A server `in_kitchen` ticket is "New" until the line cook acknowledges it,
 * after which it reads as "Preparing".
 */
export function stageOf(serverStatus: string, acknowledged: boolean): KdsStage {
  if (serverStatus === 'ready') return 'ready';
  if (serverStatus === 'served' || serverStatus === 'settled') return 'served';
  // open / in_kitchen
  return acknowledged ? 'preparing' : 'new';
}

/**
 * Display stage for a ticket on the POS "live orders" rail.
 * The rail has no per-ticket acknowledgement signal (that lives on the KDS),
 * so it uses age as the proxy: a just-fired ticket reads "New" for the first
 * few seconds, then "Preparing", while ready/served/settled map 1:1 via stageOf.
 */
export function posStageOf(serverStatus: string, ageMs: number): KdsStage {
  return stageOf(serverStatus, ageMs > 10_000);
}

/**
 * Age-based urgency for an active (new/preparing) ticket. Layers on top of the
 * stage colour as the timer escalates — Petpooja's "ageing" cue.
 */
export type Urgency = 'fresh' | 'warn' | 'late';
export function urgencyOf(ageMs: number): Urgency {
  if (ageMs > 300_000) return 'late';
  if (ageMs > 120_000) return 'warn';
  return 'fresh';
}
