import { prisma } from '@cafeos/db';
import { createNotification } from './notify';

/**
 * Cafe OS — table occupancy alert config + generation (Phase D).
 *
 * "Low-revenue occupancy" = a table sat longer than `minutes` while its running
 * bill is still under `minBillPaise`. The thresholds are configurable per outlet
 * and stored in the existing Outlet.settings JSON (no schema change).
 */
export type OccupancyConfig = { minutes: number; minBillPaise: number };

export const DEFAULT_OCCUPANCY: OccupancyConfig = { minutes: 90, minBillPaise: 50_000 }; // 90 min / ₹500

/** Read occupancy thresholds from Outlet.settings.occupancy, falling back to defaults. */
export function readOccupancyConfig(settings: unknown): OccupancyConfig {
  const o = (settings as { occupancy?: Partial<OccupancyConfig> } | null)?.occupancy;
  return {
    minutes: typeof o?.minutes === 'number' && o.minutes > 0 ? o.minutes : DEFAULT_OCCUPANCY.minutes,
    minBillPaise: typeof o?.minBillPaise === 'number' && o.minBillPaise >= 0 ? o.minBillPaise : DEFAULT_OCCUPANCY.minBillPaise,
  };
}

export type LowRevTable = { id: string; label: string; durationMin: number; billPaise: number };

/**
 * Sync low-revenue-occupancy notifications with the current floor state.
 * Opens a deduped alert per offending table, and auto-resolves (marks read)
 * alerts for tables that are no longer offending. Best-effort — never throws.
 */
export async function syncOccupancyAlerts(outletId: string, low: LowRevTable[]): Promise<void> {
  try {
    const lowIds = new Set(low.map((t) => t.id));

    // resolve stale alerts (table freed or bill recovered)
    const open = await prisma.notification.findMany({
      where: { outletId, type: 'low_revenue_occupancy', readAt: null },
      select: { id: true, entityId: true },
    });
    const staleIds = open.filter((n) => !n.entityId || !lowIds.has(n.entityId)).map((n) => n.id);
    if (staleIds.length) {
      await prisma.notification.updateMany({ where: { id: { in: staleIds } }, data: { readAt: new Date() } });
    }

    const openByTable = new Set(open.map((n) => n.entityId).filter(Boolean) as string[]);
    for (const t of low) {
      if (openByTable.has(t.id)) continue; // already alerted
      await createNotification({
        outletId,
        type: 'low_revenue_occupancy',
        severity: 'warn',
        title: `Low revenue occupancy · Table ${t.label}`,
        body: `Occupied ${t.durationMin} min with only ₹${Math.round(t.billPaise / 100)} billed`,
        entity: 'table',
        entityId: t.id,
        meta: { durationMin: t.durationMin, billPaise: t.billPaise },
      });
    }
  } catch (e) {
    console.error('occupancy alert sync failed', e);
  }
}
