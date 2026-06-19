import { EventEmitter } from 'node:events';

/**
 * Cafe OS — realtime fan-out.
 *
 * Local/dev + single-instance prod: an in-process EventEmitter is the message
 * bus. The POST/PATCH order handlers publish; the SSE stream subscribes per
 * outlet. Persisted across Next HMR via globalThis (same trick as the Prisma
 * client).
 *
 * To scale horizontally later, replace publish/subscribe with Redis pub/sub
 * (ioredis) — the call sites below don't change. That's the only edit needed.
 */
const g = globalThis as unknown as { __cafeBus?: EventEmitter };
export const bus: EventEmitter = g.__cafeBus ?? (g.__cafeBus = new EventEmitter());
bus.setMaxListeners(0); // many KDS tabs may subscribe

export type TicketItem = { name: string; qty: number; station: string | null; modifiers: { name: string }[] };
export type Ticket = {
  id: string;
  number: number;
  table: string;
  type: string;
  status: string;
  placedAt: number; // epoch ms
  items: TicketItem[];
};
export type NotifyPayload = { id: string; type: string; severity: string; title: string; body: string | null; at: number };
export type RealtimeEvent =
  | { type: 'order.new'; ticket: Ticket }
  | { type: 'order.updated'; ticket: Ticket }
  // Phase C — a QR order awaiting waiter approval. The KDS ignores this type
  // (it only reacts to order.new/updated), so nothing reaches the kitchen until
  // a waiter approves and we publish order.new.
  | { type: 'order.pending'; ticket: Ticket }
  // Phase E — an alert/notification for the owner monitor bell. Carries no
  // ticket, so the customer stream (which filters by ticket.table) ignores it.
  | { type: 'notify'; notification: NotifyPayload };

function channel(outletId: string) {
  return `outlet:${outletId}`;
}

export function publish(outletId: string, event: RealtimeEvent) {
  bus.emit(channel(outletId), event);
}

export function subscribe(outletId: string, handler: (e: RealtimeEvent) => void) {
  const ch = channel(outletId);
  bus.on(ch, handler);
  return () => bus.off(ch, handler);
}

/** Map a Prisma order (with items + table) into the lean ticket the KDS renders. */
export function toTicket(order: {
  id: string;
  number: number;
  type: string;
  status: string;
  placedAt: Date;
  table?: { label: string } | null;
  items: { nameSnapshot: string; qty: number; station: string | null; modifiers: unknown }[];
}): Ticket {
  return {
    id: order.id,
    number: order.number,
    table: order.table?.label ?? (order.type === 'takeaway' ? 'TA' : '—'),
    type: order.type,
    status: order.status,
    placedAt: order.placedAt.getTime(),
    items: order.items.map((i) => ({
      name: i.nameSnapshot,
      qty: i.qty,
      station: i.station,
      modifiers: Array.isArray(i.modifiers) ? (i.modifiers as { name: string }[]) : [],
    })),
  };
}
