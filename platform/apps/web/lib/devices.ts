/**
 * Cafe OS — device & printer registry.
 *
 * Devices (receipt/KOT/label printers, cash drawers, customer displays) are
 * stored in the existing Outlet.settings JSON under `devices` — no schema
 * change, fully backward compatible. Mirrors the occupancy/alerts pattern.
 */

export const DEVICE_TYPES = [
  { value: 'receipt_printer', label: 'Receipt / Bill printer', icon: '🧾', station: false },
  { value: 'kot_printer', label: 'Kitchen (KOT) printer', icon: '🍳', station: true },
  { value: 'label_printer', label: 'Label printer', icon: '🏷️', station: false },
  { value: 'cash_drawer', label: 'Cash drawer', icon: '💵', station: false },
  { value: 'display', label: 'Customer display', icon: '📺', station: false },
] as const;

export type DeviceType = (typeof DEVICE_TYPES)[number]['value'];

export const DEVICE_CONNECTIONS = [
  { value: 'network', label: 'Network (LAN/IP)' },
  { value: 'usb', label: 'USB' },
  { value: 'bluetooth', label: 'Bluetooth' },
] as const;

export type DeviceConnection = (typeof DEVICE_CONNECTIONS)[number]['value'];

export interface Device {
  id: string;
  name: string;
  type: DeviceType;
  connection: DeviceConnection;
  /** IP:port for network, device path/id for USB/BT — free text, optional */
  target: string;
  /** kitchen | bar | dessert — only meaningful for KOT printers */
  station: string | null;
  /** how many copies to print (printers only) */
  copies: number;
  /** the default device for its type */
  isDefault: boolean;
}

const TYPE_VALUES = DEVICE_TYPES.map((t) => t.value) as readonly string[];
const CONN_VALUES = DEVICE_CONNECTIONS.map((c) => c.value) as readonly string[];

/** Read & normalize the device list from Outlet.settings.devices. Never throws. */
export function readDevices(settings: unknown): Device[] {
  const raw = (settings as { devices?: unknown } | null)?.devices;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((d): Device | null => {
      const o = d as Record<string, unknown>;
      if (!o || typeof o.id !== 'string' || typeof o.name !== 'string') return null;
      const type = (TYPE_VALUES.includes(o.type as string) ? o.type : 'receipt_printer') as DeviceType;
      const connection = (CONN_VALUES.includes(o.connection as string) ? o.connection : 'network') as DeviceConnection;
      const copies = Number(o.copies);
      return {
        id: o.id,
        name: o.name,
        type,
        connection,
        target: typeof o.target === 'string' ? o.target : '',
        station: typeof o.station === 'string' && o.station ? o.station : null,
        copies: Number.isFinite(copies) && copies >= 1 ? Math.min(5, Math.round(copies)) : 1,
        isDefault: !!o.isDefault,
      };
    })
    .filter((d): d is Device => d !== null);
}

/** Ensure at most one default per device type (last-write-wins for the flagged one). */
export function normalizeDefaults(devices: Device[], preferId?: string): Device[] {
  const seen = new Set<string>();
  // when a specific device is preferred as default, clear others of that type first
  if (preferId) {
    const pref = devices.find((d) => d.id === preferId);
    if (pref) {
      for (const d of devices) if (d.type === pref.type) d.isDefault = d.id === preferId;
    }
  }
  return devices.map((d) => {
    if (d.isDefault && !seen.has(d.type)) {
      seen.add(d.type);
      return d;
    }
    return d.isDefault && seen.has(d.type) ? { ...d, isDefault: false } : d;
  });
}
