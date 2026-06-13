import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { subscribe, type RealtimeEvent } from '@/lib/realtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/stream — Server-Sent Events for the current staff member's outlet.
 * The KDS (and later the customer order page) subscribe here. EventSource sends
 * the session cookie automatically, so we scope the stream to that outlet.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return new Response('unauthorized', { status: 401 });

  const enc = new TextEncoder();
  let unsub: (() => void) | null = null;
  let ping: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (obj: unknown) => {
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {
          /* closed */
        }
      };

      send({ type: 'hello', outletId: session.outletId });

      unsub = subscribe(session.outletId, (e: RealtimeEvent) => send(e));

      // comment ping keeps proxies from killing the idle connection
      ping = setInterval(() => {
        try {
          controller.enqueue(enc.encode(`: ping\n\n`));
        } catch {
          /* closed */
        }
      }, 25000);

      req.signal.addEventListener('abort', () => {
        unsub?.();
        if (ping) clearInterval(ping);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
    cancel() {
      unsub?.();
      if (ping) clearInterval(ping);
    },
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
