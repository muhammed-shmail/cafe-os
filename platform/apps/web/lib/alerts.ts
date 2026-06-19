import { prisma } from '@cafeos/db';
import { createNotification } from './notify';

/**
 * Cafe OS — owner alert engine (Phase E).
 *
 * Event-driven business alerts (large discounts, cancellations, big expenses)
 * plus a derived sales-drop check. Thresholds are per-outlet, stored in
 * Outlet.settings.alerts (no schema change), with sensible defaults.
 */
export type AlertConfig = {
  largeDiscountPct: number; // flag discounts at/above this %
  highExpensePaise: number; // flag supplier outflows at/above this
  salesDropPct: number; // flag when today is this fraction below the 7-day avg
};

export const DEFAULT_ALERTS: AlertConfig = {
  largeDiscountPct: 20,
  highExpensePaise: 1_000_000, // ₹10,000
  salesDropPct: 0.4, // 40% below average
};

export function readAlertConfig(settings: unknown): AlertConfig {
  const a = (settings as { alerts?: Partial<AlertConfig> } | null)?.alerts;
  return {
    largeDiscountPct: num(a?.largeDiscountPct, DEFAULT_ALERTS.largeDiscountPct),
    highExpensePaise: num(a?.highExpensePaise, DEFAULT_ALERTS.highExpensePaise),
    salesDropPct: num(a?.salesDropPct, DEFAULT_ALERTS.salesDropPct),
  };
}
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : d);

async function configFor(outletId: string): Promise<AlertConfig> {
  const o = await prisma.outlet.findUnique({ where: { id: outletId }, select: { settings: true } });
  return readAlertConfig(o?.settings);
}

/** A discount at/above the configured threshold was applied to an order. */
export async function alertLargeDiscount(outletId: string, opts: { number: number; discountPct: number; discountPaise: number }) {
  try {
    const cfg = await configFor(outletId);
    if (opts.discountPct < cfg.largeDiscountPct) return;
    await createNotification({
      outletId,
      type: 'large_discount',
      severity: 'warn',
      title: `Large discount on order #${opts.number}`,
      body: `${opts.discountPct}% off · ₹${Math.round(opts.discountPaise / 100)} reduced`,
      entity: 'order',
      meta: { discountPct: opts.discountPct, discountPaise: opts.discountPaise },
    });
  } catch (e) {
    console.error('large discount alert failed', e);
  }
}

/** An order was cancelled / a QR order rejected. */
export async function alertOrderCancelled(outletId: string, opts: { number: number; by?: string | null; totalPaise: number }) {
  try {
    await createNotification({
      outletId,
      type: 'order_cancelled',
      severity: 'warn',
      title: `Order #${opts.number} cancelled`,
      body: `${opts.by ? `by ${opts.by} · ` : ''}₹${Math.round(opts.totalPaise / 100)} voided`,
      entity: 'order',
      meta: { totalPaise: opts.totalPaise },
    });
  } catch (e) {
    console.error('cancellation alert failed', e);
  }
}

/** A large supplier outflow (purchase or payment) was recorded. */
export async function alertHighExpense(outletId: string, opts: { vendor: string; amountPaise: number; kind: string }) {
  try {
    const cfg = await configFor(outletId);
    if (opts.amountPaise < cfg.highExpensePaise) return;
    await createNotification({
      outletId,
      type: 'high_expense',
      severity: 'warn',
      title: `High expense · ${opts.vendor}`,
      body: `₹${Math.round(opts.amountPaise / 100)} ${opts.kind}`,
      entity: 'vendor',
      meta: { amountPaise: opts.amountPaise, kind: opts.kind },
    });
  } catch (e) {
    console.error('high expense alert failed', e);
  }
}

/**
 * Derived: today's sales are well below the trailing 7-day average. Conservative
 * — only fires in the afternoon (so a quiet morning isn't flagged) and dedupes
 * to one open alert per day.
 */
export async function checkSalesDrop(outletId: string, todayPaise: number, avg7Paise: number) {
  try {
    const istHour = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date()));
    if (istHour < 15 || avg7Paise <= 0) return;
    const cfg = await configFor(outletId);
    if (todayPaise >= avg7Paise * (1 - cfg.salesDropPct)) return;

    const since = new Date();
    since.setHours(0, 0, 0, 0);
    const open = await prisma.notification.findFirst({
      where: { outletId, type: 'sales_drop', createdAt: { gte: since } },
      select: { id: true },
    });
    if (open) return;

    const pct = Math.round((1 - todayPaise / avg7Paise) * 100);
    await createNotification({
      outletId,
      type: 'sales_drop',
      severity: 'critical',
      title: `Sales down ${pct}% vs usual`,
      body: `Today ₹${Math.round(todayPaise / 100)} vs ~₹${Math.round(avg7Paise / 100)} typical`,
      entity: 'sales',
      meta: { todayPaise, avg7Paise },
    });
  } catch (e) {
    console.error('sales drop check failed', e);
  }
}
