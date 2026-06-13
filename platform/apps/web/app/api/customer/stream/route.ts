import { NextRequest } from 'next/server';
import { resolveTable } from '@/lib/customer';
import { subscribe, type RealtimeEvent } from '@/lib/realtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/customer/stream?t=<qrToken> — PUBLIC live order status for one table.
 * No staff session: the QR token is the capability. We subscribe to the outlet
 * bus but forward ONLY events for this table, so a customer never sees other
 * tables' tickets.
 */
export async function GET(req: NextRequest) {
  const t = req.nextUrl.searchParams.get('t');
  const table = await resolveTable(t);
  if (!table) return new Response('table_not_found', { status: 404 });

  const enc = new TextEncoder();
  let unsub: (() => void) | null = null;
  let ping: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (obj: unknown) => {
        try { controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch { /* closed */ }
      };
      send({ type: 'hello', table: table.label });

      unsub = subscribe(table.outlet.id, (e: RealtimeEvent) => {
        if (e.ticket?.table === table.label) send(e);
      });
      ping = setInterval(() => { try { controller.enqueue(enc.encode(`: ping\n\n`)); } catch {} }, 25000);

      req.signal.addEventListener('abort', () => {
        unsub?.();
        if (ping) clearInterval(ping);
        try { controller.close(); } catch {}
      });
    },
    cancel() { unsub?.(); if (ping) clearInterval(ping); },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  });
}
