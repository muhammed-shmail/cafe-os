import { prisma, type Prisma } from '@cafeos/db';
import { publish } from './realtime';

/**
 * Cafe OS — notification dispatcher (Phase E).
 *
 * Single funnel for every alert: persist it, push it live to the owner bell via
 * the realtime bus, and fan it out to external channels. Channels are
 * integration-ready: when their env keys are present we'd call the provider;
 * otherwise we log the intent so the seam is exercised end-to-end without creds.
 */

export type NotificationInput = {
  outletId: string;
  type: string;
  severity?: 'info' | 'warn' | 'critical';
  title: string;
  body?: string | null;
  entity?: string | null;
  entityId?: string | null;
  meta?: Prisma.InputJsonValue;
};

/** Which external channels are configured (drives the "integration ready" UI). */
export function channelStatus() {
  return {
    inApp: true, // always on — the bell + SSE feed
    push: !!process.env.WEB_PUSH_PUBLIC_KEY,
    whatsapp: !!process.env.WHATSAPP_TOKEN && !!process.env.WHATSAPP_PHONE_ID,
    email: !!(process.env.RESEND_API_KEY || process.env.SMTP_URL),
  };
}

/**
 * Create a notification: persists, publishes a live `notify` event, and
 * dispatches warn/critical alerts to external channels. Best-effort on the
 * side-effects — a channel hiccup never blocks the write.
 */
export async function createNotification(input: NotificationInput) {
  const n = await prisma.notification.create({
    data: {
      outletId: input.outletId,
      type: input.type,
      severity: input.severity ?? 'info',
      title: input.title,
      body: input.body ?? null,
      entity: input.entity ?? null,
      entityId: input.entityId ?? null,
      meta: input.meta,
    },
  });

  try {
    publish(n.outletId, {
      type: 'notify',
      notification: { id: n.id, type: n.type, severity: n.severity, title: n.title, body: n.body, at: n.createdAt.getTime() },
    });
    if (n.severity === 'warn' || n.severity === 'critical') {
      await dispatchExternal(n.title, n.body, n.severity);
    }
  } catch (e) {
    console.error('notification side-effect failed', e);
  }

  return n;
}

/** Fan an alert out to WhatsApp / email / push (stubs until creds are set). */
async function dispatchExternal(title: string, body: string | null, severity: string) {
  const ch = channelStatus();
  const text = `[${severity.toUpperCase()}] ${title}${body ? ` — ${body}` : ''}`;

  if (ch.whatsapp) {
    // TODO: POST to WhatsApp Cloud API using WHATSAPP_TOKEN / WHATSAPP_PHONE_ID
    console.log('[notify:whatsapp] send →', text);
  }
  if (ch.email) {
    // TODO: send via Resend (RESEND_API_KEY) or SMTP_URL
    console.log('[notify:email] send →', text);
  }
  if (ch.push) {
    // TODO: web-push to the owner's subscribed devices
    console.log('[notify:push] send →', text);
  }
  if (!ch.whatsapp && !ch.email && !ch.push) {
    console.log('[notify] (no external channel configured) →', text);
  }
}
