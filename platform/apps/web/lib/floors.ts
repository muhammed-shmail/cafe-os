/**
 * Cafe OS — floors / dining areas.
 *
 * A "floor" is a named area of the café (Ground Floor, Rooftop, Patio, AC
 * Hall…) that tables are grouped under. Like occupancy/devices/gst, floors live
 * in the existing `Outlet.settings` JSON — no schema change, fully reversible.
 *
 *   settings.floors      → Floor[]                    (the area list)
 *   settings.tableFloors → { [tableId]: floorId }     (which area each table is in)
 *
 * Keeping the assignment as a side map means a table with no entry (or pointing
 * at a deleted floor) simply reads as "Unassigned" — never an error.
 */

export interface Floor {
  id: string;
  name: string;
  sort: number;
}

/** Read & normalize the floor list from Outlet.settings.floors. Never throws. */
export function readFloors(settings: unknown): Floor[] {
  const raw = (settings as { floors?: unknown } | null)?.floors;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((f, i): Floor | null => {
      const o = f as Record<string, unknown>;
      if (!o || typeof o.id !== 'string' || typeof o.name !== 'string') return null;
      const sort = Number(o.sort);
      return { id: o.id, name: o.name, sort: Number.isFinite(sort) ? sort : i };
    })
    .filter((f): f is Floor => f !== null)
    .sort((a, b) => a.sort - b.sort);
}

/** Read the { tableId → floorId } assignment map. Never throws. */
export function readTableFloors(settings: unknown): Record<string, string> {
  const raw = (settings as { tableFloors?: unknown } | null)?.tableFloors;
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string' && v) out[k] = v;
  }
  return out;
}
